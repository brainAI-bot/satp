#!/usr/bin/env node
'use strict';

/**
 * Offline package-boundary smoke check.
 * Verifies the Git-installable root entrypoint exposes the SATP client surface
 * expected by AgentFolio and external consumers. This script does not read keys,
 * call Solana RPC, publish packages, or deploy anything.
 */
const fs = require('node:fs');
const path = require('node:path');
const satp = require('..');

const requiredExports = [
  'SATPSDK',
  'SATPV3SDK',
  'createSATPClient',
  'getV3ProgramIds',
  'hashAgentId',
  'getGenesisPDA',
  'prepareIdentityAttestationRequest',
  'verifyIdentityAttestationRequest',
  'buildSatpTrustPacket',
  'validateSatpTrustPacket',
  'normalizeRuntimeAuthorizationEvidence',
  'verifyRuntimeAuthorizationEvidence',
  'createRuntimePolicyAdapter',
  'evaluateRuntimePolicy',
  'buildRuntimePolicyActionDescriptor',
  'buildWalletControlChallenge',
  'canonicalWalletControlChallenge',
  'hashWalletControlChallenge',
  'deriveWalletControlChallengePdas',
  'verifyWalletControlChallengeSignature',
  'X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION',
  'parseX402DiscoveryMetadata',
  'buildX402EvidenceLookup',
  'buildRuntimePolicyActionDescriptorFromX402Discovery',
  'buildSignerSeparationConfig',
  'validateSignerSeparationConfig',
];

const missing = requiredExports.filter((key) => !(key in satp));
if (missing.length) {
  throw new Error(`Missing SATP public exports: ${missing.join(', ')}`);
}

const sdk = satp.createSATPClient({ network: 'devnet' });
if (!sdk || !sdk.programIds || !sdk.programIds.IDENTITY) {
  throw new Error('createSATPClient({ network: devnet }) did not expose program IDs');
}

const request = satp.prepareIdentityAttestationRequest({
  subjectWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',
  claimType: 'github_verified',
  metadataHash: '4d9678a7869c25f26a2e38e43f70fc7d0c4142d20b1743a43e50cd8fd012f3d7',
});
if (request.signingRequired !== false || request.instructions.length !== 0 || request.transaction !== null) {
  throw new Error('prepareIdentityAttestationRequest did not return unsigned offline metadata');
}
const requestVerification = satp.verifyIdentityAttestationRequest(request, {
  expectedSubjectWallet: request.subjectWallet,
  expectedClaimType: request.claimType,
  expectedNetwork: request.network,
});
if (!requestVerification.ok || requestVerification.warnings.length !== 0) {
  throw new Error('verifyIdentityAttestationRequest did not validate prepared offline metadata');
}

const packet = satp.buildSatpTrustPacket({
  subjectWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',
  claimType: 'github_verified',
  metadataHash: '4d9678a7869c25f26a2e38e43f70fc7d0c4142d20b1743a43e50cd8fd012f3d7',
});
if (!satp.validateSatpTrustPacket(packet).ok || packet.flags.signingRequired !== false || packet.transaction !== null) {
  throw new Error('buildSatpTrustPacket did not return validated read-only metadata');
}

const policyDecision = satp.evaluateRuntimePolicy(
  {
    active: true,
    satpVerified: true,
    agentFolioTrustScore: 90,
    capabilities: ['mcp:read'],
    evidenceUpdatedAt: '2026-05-21T00:00:00Z',
  },
  {
    type: 'mcp_protected_tool',
    requiresCapability: 'mcp:read',
    requiresFreshEvidence: true,
  },
  { now: '2026-05-22T00:00:00Z' },
);
if (policyDecision.decision !== 'allow') {
  throw new Error('evaluateRuntimePolicy did not return allow for verified local policy input');
}

const builtPolicyAction = satp.buildRuntimePolicyActionDescriptor({
  type: 'mcp_protected_tool',
  capability: 'mcp:read',
});
if (
  builtPolicyAction.schemaVersion !== satp.RUNTIME_POLICY_HOST_ACTION_DESCRIPTOR_SCHEMA_VERSION
  || builtPolicyAction.requiresCapability !== 'mcp:read'
  || builtPolicyAction.guardrails.writesSolanaState !== false
) {
  throw new Error('buildRuntimePolicyActionDescriptor did not return guarded host action metadata');
}

const policyAdapter = satp.createRuntimePolicyAdapter({
  defaultActionType: 'mcp_protected_tool',
  now: '2026-05-22T00:00:00Z',
});
const adapterAction = policyAdapter.action({ capability: 'mcp:read' });
const adapterDecision = policyAdapter.evaluate(
  {
    active: true,
    satpVerified: true,
    agentFolioTrustScore: 90,
    capabilities: ['mcp:read'],
    evidenceUpdatedAt: '2026-05-21T00:00:00Z',
  },
  adapterAction,
);
if (adapterDecision.decision !== 'allow' || !policyAdapter.explain(adapterDecision).length) {
  throw new Error('createRuntimePolicyAdapter did not expose a working local host adapter');
}

const signerConfig = satp.buildSignerSeparationConfig({
  operationalSignerPublicKey: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',
  ownerUpgradeAuthorityPublicKey: 'EJtQh4Gyg88zXvSmFpxYkkeZsPwTsjfm4LvjmPQX1FD3',
});
if (!satp.validateSignerSeparationConfig(signerConfig).ok || signerConfig.flags.transfersAuthority !== false) {
  throw new Error('signer separation config did not preserve public-only no-authority-transfer guardrails');
}

const declarations = fs.readFileSync(path.join(__dirname, '..', 'packages/satp-client/src/index.d.ts'), 'utf8');
const actionDescriptor = declarations.match(/export interface RuntimePolicyActionDescriptor \{([\s\S]*?)\n\}/);
if (!actionDescriptor) {
  throw new Error('Missing RuntimePolicyActionDescriptor declaration');
}

const requiredActionFields = [
  'resource?: string;',
  'operation?: string;',
  'protectedTool?: boolean;',
  'operatorApprovalRequired?: boolean;',
];
const missingActionFields = requiredActionFields.filter((field) => !actionDescriptor[1].includes(field));
if (missingActionFields.length) {
  throw new Error('RuntimePolicyActionDescriptor missing runtime-supported fields: ' + missingActionFields.join(', '));
}

if (actionDescriptor[1].includes('requiresApproval')) {
  throw new Error('RuntimePolicyActionDescriptor exposes requiresApproval, but runtime does not read that no-op field');
}

const walletControlChallenge = require('@brainai/satp-client/wallet-control-challenge');
const x402Discovery = require('@brainai/satp-client/x402-discovery');
const runtimeAuthorizationEvidence = require('@brainai/satp-client/runtime-authorization-evidence');
for (const key of [
  'buildWalletControlChallenge',
  'canonicalWalletControlChallenge',
  'hashWalletControlChallenge',
  'deriveWalletControlChallengePdas',
  'verifyWalletControlChallengeSignature',
]) {
  if (typeof satp[key] !== 'function') {
    throw new Error(`SATP root export ${key} is not a function`);
  }
  if (typeof walletControlChallenge[key] !== 'function') {
    throw new Error(`SATP wallet-control subpath export ${key} is not a function`);
  }
}

for (const key of [
  'normalizeRuntimeAuthorizationEvidence',
  'verifyRuntimeAuthorizationEvidence',
]) {
  if (typeof satp[key] !== 'function') {
    throw new Error(`SATP root export ${key} is not a function`);
  }
  if (typeof runtimeAuthorizationEvidence[key] !== 'function') {
    throw new Error(`SATP runtime-authorization-evidence subpath export ${key} is not a function`);
  }
}

for (const key of [
  'parseX402DiscoveryMetadata',
  'buildX402EvidenceLookup',
  'buildRuntimePolicyActionDescriptorFromX402Discovery',
]) {
  if (typeof satp[key] !== 'function') {
    throw new Error(`SATP root export ${key} is not a function`);
  }
  if (typeof x402Discovery[key] !== 'function') {
    throw new Error(`SATP x402-discovery subpath export ${key} is not a function`);
  }
}

console.log(`SATP export surface OK: ${requiredExports.join(', ')}`);

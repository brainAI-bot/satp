#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const client = require('@brainai/satp-client');
const attestationEvidence = require('@brainai/satp-client/attestation-evidence');
const satp = require('@brainai/satp');
const core = require('@brainai/satp-core');
const solana = require('@brainai/satp-solana');

const subjectWallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG';
const metadataHash = '4d9678a7869c25f26a2e38e43f70fc7d0c4142d20b1743a43e50cd8fd012f3d7';

for (const [packageName, api, required] of [
  ['@brainai/satp-client', client, ['normalizeSatpAttestationEvidence', 'verifySatpAttestationEvidence']],
  ['@brainai/satp-client/attestation-evidence', attestationEvidence, ['normalizeSatpAttestationEvidence', 'verifySatpAttestationEvidence']],
  ['@brainai/satp', satp, ['core', 'solana', 'prepareIdentityAttestationRequest', 'buildSatpTrustPacket', 'normalizeSatpAttestationEvidence', 'verifySatpAttestationEvidence', 'normalizeRuntimeAuthorizationEvidence', 'verifyRuntimeAuthorizationEvidence', 'getV3ProgramIds', 'getGenesisPDA', 'createSATPClient', 'buildSignerSeparationConfig']],
  ['@brainai/satp-core', core, ['prepareIdentityAttestationRequest', 'buildSatpTrustPacket', 'validateSatpTrustPacket', 'normalizeSatpAttestationEvidence', 'verifySatpAttestationEvidence', 'normalizeRuntimeAuthorizationEvidence', 'verifyRuntimeAuthorizationEvidence', 'createRuntimePolicyAdapter', 'evaluateRuntimePolicy', 'buildRuntimePolicyActionDescriptor', 'buildSignerSeparationConfig']],
  ['@brainai/satp-solana', solana, ['getV3ProgramIds', 'hashAgentId', 'getGenesisPDA', 'createSATPClient', 'buildSignerSeparationConfig']],
]) {
  const missing = required.filter((key) => !(key in api));
  assert.deepEqual(missing, [], `${packageName} missing exports`);
}

const request = core.prepareIdentityAttestationRequest({
  subjectWallet,
  claimType: 'github_verified',
  metadataHash,
});
assert.equal(request.signingRequired, false);
assert.deepEqual(request.instructions, []);
assert.deepEqual(request.signers, []);
assert.equal(request.transaction, null);

const packet = satp.buildSatpTrustPacket({
  subjectWallet,
  claimType: 'github_verified',
  metadataHash,
});
assert.equal(core.validateSatpTrustPacket(packet).ok, true);
assert.equal(packet.flags.writesRequired, false);

const decision = satp.core.evaluateRuntimePolicy(
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
assert.equal(decision.decision, 'allow');

const actionDescriptor = core.buildRuntimePolicyActionDescriptor({
  type: 'agentfolio_trust_gate',
  profileId: 'brainchain-demo',
});
assert.equal(actionDescriptor.operation, 'trust-score-read');
assert.equal(actionDescriptor.guardrails.writesSolanaState, false);

const adapter = core.createRuntimePolicyAdapter({
  defaultActionType: 'mcp_protected_tool',
  now: '2026-05-22T00:00:00Z',
});
assert.equal(adapter.action({ capability: 'mcp:read' }).type, 'mcp_protected_tool');

const ids = solana.getV3ProgramIds('devnet');
assert.equal(typeof ids.IDENTITY.toBase58(), 'string');
assert.equal(solana.hashAgentId('satp-package-boundary').length, 32);

const [genesisPda, genesisBump] = satp.solana.getGenesisPDA('satp-package-boundary', 'devnet');
assert.equal(typeof genesisPda.toBase58(), 'string');
assert.equal(Number.isInteger(genesisBump), true);

const sdk = satp.createSATPClient({ network: 'devnet' });
assert.equal(typeof sdk.programIds.IDENTITY.toBase58(), 'string');

const signerConfig = satp.buildSignerSeparationConfig({
  operationalSignerPublicKey: subjectWallet,
  ownerUpgradeAuthorityPublicKey: 'EJtQh4Gyg88zXvSmFpxYkkeZsPwTsjfm4LvjmPQX1FD3',
});
assert.equal(signerConfig.flags.publicKeysOnly, true);
assert.equal(signerConfig.ownerUpgradeAuthority.operationalSignerMayUse, false);

console.log('SATP package entrypoints OK: @brainai/satp-client, @brainai/satp-client/attestation-evidence, @brainai/satp, @brainai/satp-core, @brainai/satp-solana');

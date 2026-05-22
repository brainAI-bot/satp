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
  'buildSatpTrustPacket',
  'validateSatpTrustPacket',
  'evaluateRuntimePolicy',
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

console.log('SATP export surface OK: ' + requiredExports.join(', '));

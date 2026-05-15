#!/usr/bin/env node
'use strict';

/**
 * Offline package-boundary smoke check.
 * Verifies the Git-installable root entrypoint exposes the SATP client surface
 * expected by AgentFolio and external consumers. This script does not read keys,
 * call Solana RPC, publish packages, or deploy anything.
 */
const satp = require('..');

const requiredExports = [
  'SATPSDK',
  'SATPV3SDK',
  'createSATPClient',
  'getV3ProgramIds',
  'hashAgentId',
  'getGenesisPDA',
  'prepareIdentityAttestationRequest',
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

console.log(`SATP export surface OK: ${requiredExports.join(', ')}`);

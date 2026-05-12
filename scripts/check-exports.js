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
];

const missing = requiredExports.filter((key) => !(key in satp));
if (missing.length) {
  throw new Error(`Missing SATP public exports: ${missing.join(', ')}`);
}

const sdk = satp.createSATPClient({ network: 'devnet' });
if (!sdk || !sdk.programIds || !sdk.programIds.IDENTITY) {
  throw new Error('createSATPClient({ network: devnet }) did not expose program IDs');
}

console.log(`SATP export surface OK: ${requiredExports.join(', ')}`);

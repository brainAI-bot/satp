#!/usr/bin/env node
'use strict';

/**
 * Offline SATP build verification.
 *
 * This intentionally performs no RPC calls, deploys, publishes, keypair reads,
 * or AgentFolio imports. It verifies the extracted repo-local SATP client can be
 * loaded as the package artifact and exposes the expected v2/v3 SDK surface.
 */

const assert = require('assert/strict');
const { createRequire } = require('module');
const path = require('path');

const satpClientRequire = createRequire(path.resolve(__dirname, '../packages/satp-client/package.json'));
const { PublicKey } = satpClientRequire('@solana/web3.js');
const satp = satpClientRequire('./src');

const requiredExports = [
  'SATPSDK',
  'SATPV3SDK',
  'createSATPClient',
  'getIdentityPDA',
  'getReviewCounterPDA',
  'getMintTrackerPDA',
  'getV3ProgramIds',
  'deriveGenesisPda',
  'deriveReviewPda',
  'deserializeGenesis',
  'BorshReader',
];

for (const name of requiredExports) {
  assert.equal(typeof satp[name] !== 'undefined', true, `missing export ${name}`);
}

const wallet = new PublicKey('11111111111111111111111111111112');
const sdk = new satp.SATPSDK({ network: 'devnet', rpcUrl: 'http://127.0.0.1:8899' });
const pdas = sdk.getPDAs(wallet);

for (const [name, value] of Object.entries(pdas)) {
  assert.doesNotThrow(() => new PublicKey(value), `${name} should be a valid PublicKey`);
}

const [identityPda] = satp.getIdentityPDA(wallet, 'devnet');
assert.equal(pdas.identity, identityPda.toBase58(), 'SATPSDK.getPDAs identity matches helper');

const programIds = satp.getV3ProgramIds('devnet');
for (const [name, value] of Object.entries(programIds)) {
  assert.doesNotThrow(() => new PublicKey(value), `V3 program id ${name} should be valid`);
}

const [genesisPda] = satp.deriveGenesisPda('brainchain-test-agent', 'devnet');
assert.ok(genesisPda instanceof PublicKey, 'deriveGenesisPda returns PublicKey');

console.log('offline SATP build verification passed');
console.log(`verified ${requiredExports.length} exports and ${Object.keys(pdas).length} PDA derivations`);

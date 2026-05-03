#!/usr/bin/env node
'use strict';

/**
 * Offline SATP client smoke test.
 *
 * No Solana RPC calls, deploys, keypair files, AgentFolio imports, or publishes.
 */

const assert = require('assert/strict');
const { PublicKey } = require('@solana/web3.js');
const satp = require('./src');

const TEST_WALLET = new PublicKey('11111111111111111111111111111112');
const sdk = new satp.SATPSDK({ network: 'devnet', rpcUrl: 'http://127.0.0.1:8899' });

const pdas = sdk.getPDAs(TEST_WALLET);
const expectedPdas = [
  'identity',
  'reviewCounter',
  'mintTracker',
  'reputationAuthority',
  'validationAuthority',
];

for (const name of expectedPdas) {
  assert.ok(pdas[name], `missing ${name}`);
  assert.doesNotThrow(() => new PublicKey(pdas[name]), `${name} should be a valid PublicKey`);
}

const [identityPda] = satp.getIdentityPDA(TEST_WALLET, 'devnet');
assert.equal(pdas.identity, identityPda.toBase58(), 'identity PDA helper mismatch');

const [genesisPda] = satp.deriveGenesisPda('brainchain-test-agent', 'devnet');
assert.ok(genesisPda instanceof PublicKey, 'deriveGenesisPda returns PublicKey');

const client = satp.createSATPClient({ network: 'devnet', rpcUrl: 'http://127.0.0.1:8899' });
assert.equal(client.network, 'devnet');
assert.equal(client.rpcUrl, 'http://127.0.0.1:8899');

console.log('SATP client offline smoke test passed');

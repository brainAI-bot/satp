#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const RECENT_BLOCKHASH = '11111111111111111111111111111111';
const PLATFORM_TREASURY = 'FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be';
const CLIENT = 'Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc';
const AGENT = '7sH3qkzavHgmF8zPDYj8Vw5phb6c6QG4yZKT7qFmUXH6';
const ESCROW = '4Zt5N7BzNVmK8aeh6S1Qb3pNXvXbGtYukAr7qkWh7X7R';

function assertFeeRoutingInstruction(result, label) {
  assert.ok(result && result.transaction, `${label} must return a transaction`);
  assert.equal(result.transaction.recentBlockhash, RECENT_BLOCKHASH, `${label} must use the stubbed blockhash`);
  assert.equal(result.transaction.instructions.length, 1, `${label} must build exactly one instruction`);

  const instruction = result.transaction.instructions[0];
  assert.equal(instruction.keys.length, 4, `${label} must include exactly four accounts`);
  assert.equal(
    instruction.keys[3].pubkey.toBase58(),
    PLATFORM_TREASURY,
    `${label} platform fee account must be fourth`,
  );
  assert.equal(instruction.keys[3].isSigner, false, `${label} platform fee account must not sign`);
  assert.equal(instruction.keys[3].isWritable, true, `${label} platform fee account must be writable`);
}

async function verifyPackage(packageRoot) {
  const resolvedRoot = path.resolve(packageRoot);
  const satp = require(resolvedRoot);
  assert.equal(typeof satp.SATPV3SDK, 'function', 'installed package must export SATPV3SDK');

  const sdk = new satp.SATPV3SDK({ network: 'mainnet' });
  sdk.connection.getLatestBlockhash = async () => ({ blockhash: RECENT_BLOCKHASH });

  const release = await sdk.buildEscrowRelease(CLIENT, AGENT, ESCROW);
  assertFeeRoutingInstruction(release, 'release');

  const partial = await sdk.buildPartialRelease(CLIENT, AGENT, ESCROW, 19);
  assertFeeRoutingInstruction(partial, 'partial release');
  assert.equal(
    partial.transaction.instructions[0].data.readBigUInt64LE(8),
    19n,
    'partial release must encode the requested gross amount',
  );

  console.log(`satp-client packed fee-routing builders OK: ${resolvedRoot}; release=4 accounts; partial=4 accounts; platform fee account fourth`);
}

if (require.main === module) {
  const packageRoot = process.argv[2];
  if (!packageRoot) {
    console.error('usage: verify-satp-client-packed-fee-routing.js <installed-package-root>');
    process.exit(2);
  }
  verifyPackage(packageRoot).catch((error) => {
    console.error(`packed fee-routing verification failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { verifyPackage };

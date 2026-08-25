#!/usr/bin/env node

const assert = require('node:assert/strict');
const { PublicKey } = require('@solana/web3.js');
const {
  SATPV3SDK,
  V3_ESCROW_PLATFORM_TREASURY,
  anchorDiscriminator,
} = require('./src/index');

const RECENT_BLOCKHASH = '11111111111111111111111111111111';
const client = new PublicKey('Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc');
const agent = new PublicKey('7sH3qkzavHgmF8zPDYj8Vw5phb6c6QG4yZKT7qFmUXH6');
const escrow = new PublicKey('4Zt5N7BzNVmK8aeh6S1Qb3pNXvXbGtYukAr7qkWh7X7R');
const wrongTreasury = new PublicKey('11111111111111111111111111111111');

function assertSolFeeRoutingInstruction(ix, name, expectedDataLength) {
  assert.deepEqual(ix.data.slice(0, 8), anchorDiscriminator(name));
  assert.equal(ix.data.length, expectedDataLength);
  assert.equal(ix.keys.length, 4, `${name} must include exactly four accounts`);
  assert.equal(ix.keys[0].pubkey.toBase58(), escrow.toBase58());
  assert.equal(ix.keys[1].pubkey.toBase58(), client.toBase58());
  assert.equal(ix.keys[2].pubkey.toBase58(), agent.toBase58());
  assert.equal(ix.keys[3].pubkey.toBase58(), V3_ESCROW_PLATFORM_TREASURY.toBase58());
  assert.equal(ix.keys[3].isSigner, false);
  assert.equal(ix.keys[3].isWritable, true);
}

(async () => {
  const sdk = new SATPV3SDK({ network: 'mainnet' });
  sdk.connection.getLatestBlockhash = async () => ({ blockhash: RECENT_BLOCKHASH });

  assert.equal(
    V3_ESCROW_PLATFORM_TREASURY.toBase58(),
    'FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be',
    'treasury is the audited immutable recipient',
  );

  await assert.rejects(
    sdk.buildEscrowRelease(client, agent, escrow, { treasury: wrongTreasury }),
    /Escrow V3 SOL treasury must equal FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be/,
  );
  await assert.rejects(
    sdk.buildPartialRelease(client, agent, escrow, 19, { treasury: wrongTreasury }),
    /Escrow V3 SOL treasury must equal FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be/,
  );

  const full = await sdk.buildEscrowRelease(client, agent, escrow, {
    treasury: V3_ESCROW_PLATFORM_TREASURY,
  });
  assertSolFeeRoutingInstruction(full.transaction.instructions[0], 'release', 8);

  const partial = await sdk.buildPartialRelease(client, agent, escrow, 19);
  const partialIx = partial.transaction.instructions[0];
  assertSolFeeRoutingInstruction(partialIx, 'partial_release', 16);
  assert.equal(partialIx.data.readBigUInt64LE(8), 19n, 'gross partial amount is encoded exactly');

  console.log('V3 SOL escrow fee-routing builders OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

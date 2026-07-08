#!/usr/bin/env node

const assert = require('node:assert/strict');
const {
  PublicKey,
  SystemProgram,
} = require('@solana/web3.js');
const {
  SATPV3SDK,
  V3_DEVNET_TOKEN_MINTS,
  SPL_TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getV3EscrowVaultATA,
  anchorDiscriminator,
} = require('./src/index');

const RECENT_BLOCKHASH = '11111111111111111111111111111111';
const client = new PublicKey('Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc');
const agent = new PublicKey('7sH3qkzavHgmF8zPDYj8Vw5phb6c6QG4yZKT7qFmUXH6');
const arbiter = new PublicKey('4Zt5N7BzNVmK8aeh6S1Qb3pNXvXbGtYukAr7qkWh7X7R');
const agentId = 'agent-usdc-builder';
const description = 'Fund escrow with USDC';
const deadline = 1893456000;
const nonce = 7;

function lastInstruction(tx) {
  return tx.instructions[tx.instructions.length - 1];
}

function assertDisc(ix, name) {
  assert.deepEqual(ix.data.slice(0, 8), anchorDiscriminator(name), `${name} discriminator`);
}

(async () => {
  const sdk = new SATPV3SDK({ network: 'devnet' });
  sdk.connection.getLatestBlockhash = async () => ({ blockhash: RECENT_BLOCKHASH });

  assert.equal(V3_DEVNET_TOKEN_MINTS.USDC.toBase58(), '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

  const solCreate = await sdk.buildCreateEscrow(
    client,
    agent,
    agentId,
    1_000_000,
    description,
    deadline,
    nonce,
    { arbiter }
  );
  assert.equal(solCreate.transaction.instructions.length, 1, 'SOL create has one escrow instruction');
  assertDisc(lastInstruction(solCreate.transaction), 'create_escrow');
  assert.equal(solCreate.transaction.instructions[0].keys.at(-1).pubkey.toBase58(), SystemProgram.programId.toBase58());

  const usdcCreate = await sdk.buildCreateEscrow(
    client,
    agent,
    agentId,
    25_000_000,
    description,
    deadline,
    nonce,
    { currency: 'USDC', arbiter }
  );
  const { escrowPDA, vaultATA } = getV3EscrowVaultATA(
    client,
    usdcCreate.descriptionHash,
    nonce,
    V3_DEVNET_TOKEN_MINTS.USDC,
    'devnet'
  );
  const [clientTokenAccount] = getAssociatedTokenAddress(client, V3_DEVNET_TOKEN_MINTS.USDC);

  assert.equal(usdcCreate.currency, 'USDC');
  assert.equal(usdcCreate.escrowPDA.toBase58(), escrowPDA.toBase58(), 'USDC create escrow PDA deterministic');
  assert.equal(usdcCreate.vaultTokenAccount.toBase58(), vaultATA.toBase58(), 'USDC vault ATA deterministic');
  assert.equal(usdcCreate.clientTokenAccount.toBase58(), clientTokenAccount.toBase58(), 'USDC client ATA deterministic');
  assert.equal(usdcCreate.transaction.instructions.length, 2, 'USDC create includes idempotent vault ATA creation');
  assert.equal(usdcCreate.transaction.instructions[0].programId.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
  assertDisc(lastInstruction(usdcCreate.transaction), 'create_usdc_escrow');
  assert.equal(lastInstruction(usdcCreate.transaction).keys[8].pubkey.toBase58(), SPL_TOKEN_PROGRAM_ID.toBase58());

  const usdcRelease = await sdk.buildEscrowRelease(client, agent, escrowPDA, { currency: 'USDC' });
  assert.equal(usdcRelease.transaction.instructions[0].programId.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
  assertDisc(lastInstruction(usdcRelease.transaction), 'release_usdc');
  assert.equal(usdcRelease.vaultTokenAccount.toBase58(), vaultATA.toBase58(), 'USDC release vault ATA deterministic');

  const usdcPartial = await sdk.buildPartialRelease(client, agent, escrowPDA, 5_000_000, { currency: 'USDC' });
  assertDisc(lastInstruction(usdcPartial.transaction), 'partial_release_usdc');
  assert.equal(Number(lastInstruction(usdcPartial.transaction).data.readBigUInt64LE(8)), 5_000_000);

  const usdcCancel = await sdk.buildCancelEscrow(client, escrowPDA, { currency: 'USDC' });
  assertDisc(lastInstruction(usdcCancel.transaction), 'cancel_usdc');
  assert.equal(usdcCancel.clientTokenAccount.toBase58(), clientTokenAccount.toBase58(), 'USDC cancel client ATA deterministic');

  const usdcResolve = await sdk.buildResolveDispute(
    arbiter,
    agent,
    client,
    escrowPDA,
    15_000_000,
    10_000_000,
    { currency: 'USDC' }
  );
  assert.equal(usdcResolve.transaction.instructions.length, 3, 'USDC resolve creates both recipient ATAs by default');
  assertDisc(lastInstruction(usdcResolve.transaction), 'resolve_dispute_usdc');
  assert.equal(Number(lastInstruction(usdcResolve.transaction).data.readBigUInt64LE(8)), 15_000_000);
  assert.equal(Number(lastInstruction(usdcResolve.transaction).data.readBigUInt64LE(16)), 10_000_000);

  console.log('V3 USDC escrow builders OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

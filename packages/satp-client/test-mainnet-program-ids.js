#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { Connection } = require('@solana/web3.js');
const {
  createSATPClient,
  getProgramIds,
  getV3ProgramIds,
} = require('./src');

const MAINNET_RPC = process.env.SATP_MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
const EXPECTED_V3_IDS = {
  IDENTITY: 'GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG',
  REVIEWS: 'r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4',
  REPUTATION: '2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ',
  ATTESTATIONS: '6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD',
  VALIDATION: '6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV',
  ESCROW: 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C',
};

async function main() {
  const v3MainnetIds = getV3ProgramIds('mainnet');
  const legacyMainnetIds = getProgramIds('mainnet');
  const client = createSATPClient({ network: 'mainnet', rpcUrl: MAINNET_RPC });
  assert.equal(client.network, 'mainnet');

  for (const [name, expected] of Object.entries(EXPECTED_V3_IDS)) {
    assert.equal(v3MainnetIds[name].toBase58(), expected, `${name} V3 mainnet export`);
    assert.equal(legacyMainnetIds[name].toBase58(), expected, `${name} legacy mainnet export`);
    assert.equal(client.programIds[name].toBase58(), expected, `${name} client mainnet export`);
  }

  const connection = new Connection(MAINNET_RPC, 'confirmed');
  for (const [name, programId] of Object.entries(v3MainnetIds)) {
    const info = await connection.getAccountInfo(programId);
    assert.ok(info, `${name} mainnet program account exists`);
    assert.equal(info.executable, true, `${name} mainnet program account is executable`);
  }

  console.log('mainnet program ID exports resolve to executable programs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

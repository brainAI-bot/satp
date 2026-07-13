#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  SATPSDK,
  SATPV3SDK,
  createSATPClient,
  getEscrowPDA,
  getProgramIds,
  getV3ProgramIds,
  buildWalletControlChallenge,
  canonicalWalletControlChallenge,
  hashWalletControlChallenge,
  deriveWalletControlChallengePdas,
  verifyWalletControlChallengeSignature,
} = require('./src');
const walletControlChallengeSubpath = require('@brainai/satp-client/wallet-control-challenge');

const DEVNET_RPC = 'https://api.devnet.solana.com';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const CUSTOM_RPC = 'https://rpc.example.invalid';

const defaultClient = createSATPClient();
assert.equal(defaultClient.network, 'devnet');
assert.equal(defaultClient.rpcUrl, DEVNET_RPC);

const explicitDevnet = createSATPClient({ network: 'devnet' });
assert.equal(explicitDevnet.network, 'devnet');
assert.equal(explicitDevnet.rpcUrl, DEVNET_RPC);

const customRpc = createSATPClient({ rpcUrl: CUSTOM_RPC });
assert.equal(customRpc.network, 'devnet');
assert.equal(customRpc.rpcUrl, CUSTOM_RPC);

const exportedDevnetString = new SATPV3SDK('devnet');
assert.equal(exportedDevnetString.network, 'devnet');
assert.equal(exportedDevnetString.rpcUrl, DEVNET_RPC);

const directDevnetString = createSATPClient('devnet');
assert.equal(directDevnetString.network, 'devnet');
assert.equal(directDevnetString.rpcUrl, DEVNET_RPC);

const mainnetFromRpc = createSATPClient(MAINNET_RPC);
assert.equal(mainnetFromRpc.network, 'mainnet');
assert.equal(mainnetFromRpc.rpcUrl, MAINNET_RPC);

const explicitMainnet = createSATPClient({ network: 'mainnet', rpcUrl: MAINNET_RPC });
assert.equal(explicitMainnet.network, 'mainnet');
assert.equal(explicitMainnet.rpcUrl, MAINNET_RPC);

const directMainnetRpc = new SATPV3SDK({ rpcUrl: MAINNET_RPC });
assert.equal(directMainnetRpc.network, 'mainnet');
assert.equal(directMainnetRpc.rpcUrl, MAINNET_RPC);

const directMainnetNetwork = new SATPV3SDK({ network: 'mainnet' });
assert.equal(directMainnetNetwork.network, 'mainnet');
assert.equal(directMainnetNetwork.rpcUrl, MAINNET_RPC);

const exportedMainnetString = new SATPV3SDK('mainnet');
assert.equal(exportedMainnetString.network, 'mainnet');
assert.equal(exportedMainnetString.rpcUrl, MAINNET_RPC);

const v3MainnetIds = getV3ProgramIds('mainnet');
assert.equal(v3MainnetIds.IDENTITY.toBase58(), 'GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG');
assert.equal(v3MainnetIds.REVIEWS.toBase58(), 'r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4');
assert.equal(v3MainnetIds.REPUTATION.toBase58(), '2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ');
assert.equal(v3MainnetIds.ATTESTATIONS.toBase58(), '6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD');
assert.equal(v3MainnetIds.VALIDATION.toBase58(), '6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV');
assert.equal(v3MainnetIds.ESCROW.toBase58(), 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C');

assert.throws(
  () => getV3ProgramIds('testnet'),
  /Invalid network/
);

const v2Default = new SATPSDK();
assert.equal(v2Default.network, 'devnet');
assert.equal(v2Default.rpcUrl, DEVNET_RPC);

assert.throws(
  () => new SATPSDK({ network: 'mainnet' }),
  /Legacy SATPSDK V2 mainnet access is fenced/
);

const v2MainnetExplicit = new SATPSDK({ network: 'mainnet', allowLegacyV2Mainnet: true });
assert.equal(v2MainnetExplicit.network, 'mainnet');
assert.equal(v2MainnetExplicit.rpcUrl, MAINNET_RPC);

const v2Custom = new SATPSDK({ rpcUrl: CUSTOM_RPC });
assert.equal(v2Custom.network, 'devnet');
assert.equal(v2Custom.rpcUrl, CUSTOM_RPC);

assert.throws(
  () => getProgramIds('mainnet'),
  /Legacy SATP V2 mainnet program IDs are fenced/
);
assert.throws(
  () => require('./src/constants').MAINNET_PROGRAM_IDS.IDENTITY,
  /Legacy SATP V2 mainnet program IDs are fenced/
);

const v2MainnetIds = getProgramIds('mainnet', { allowLegacyV2Mainnet: true });
assert.equal(v2MainnetIds.ESCROW, null);
assert.throws(
  () => getEscrowPDA('11111111111111111111111111111112', Buffer.alloc(32), 'mainnet'),
  /Legacy SATP V2 mainnet program IDs are fenced/
);

for (const [name, value] of Object.entries({
  buildWalletControlChallenge,
  canonicalWalletControlChallenge,
  hashWalletControlChallenge,
  deriveWalletControlChallengePdas,
  verifyWalletControlChallengeSignature,
})) {
  assert.equal(typeof value, 'function', name + ' export must be a function');
  assert.equal(typeof walletControlChallengeSubpath[name], 'function', name + ' subpath export must be a function');
}

console.log('release safety defaults OK');

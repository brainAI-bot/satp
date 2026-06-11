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

assert.throws(
  () => createSATPClient(MAINNET_RPC),
  /Mainnet RPC requires network=mainnet/
);

const explicitMainnet = createSATPClient({ network: 'mainnet', rpcUrl: MAINNET_RPC });
assert.equal(explicitMainnet.network, 'mainnet');
assert.equal(explicitMainnet.rpcUrl, MAINNET_RPC);
assert.throws(
  () => new SATPV3SDK({ rpcUrl: MAINNET_RPC }),
  /Mainnet RPC requires network=mainnet/
);
const v3Mainnet = new SATPV3SDK({ network: 'mainnet' });
assert.equal(v3Mainnet.network, 'mainnet');
assert.equal(v3Mainnet.rpcUrl, MAINNET_RPC);
const v3MainnetString = new SATPV3SDK('mainnet');
assert.equal(v3MainnetString.network, 'mainnet');
const v3MainnetIds = getV3ProgramIds('mainnet');
assert.equal(v3MainnetIds.IDENTITY.toBase58(), 'GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG');
assert.equal(v3MainnetIds.ESCROW.toBase58(), 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C');

const v2Default = new SATPSDK();
assert.equal(v2Default.network, 'devnet');
assert.equal(v2Default.rpcUrl, DEVNET_RPC);

const v2Custom = new SATPSDK({ rpcUrl: CUSTOM_RPC });
assert.equal(v2Custom.network, 'devnet');
assert.equal(v2Custom.rpcUrl, CUSTOM_RPC);

const v2MainnetIds = getProgramIds('mainnet');
assert.equal(v2MainnetIds.IDENTITY.toBase58(), v3MainnetIds.IDENTITY.toBase58());
assert.equal(v2MainnetIds.ESCROW.toBase58(), v3MainnetIds.ESCROW.toBase58());
const [mainnetEscrowPda] = getEscrowPDA('11111111111111111111111111111112', Buffer.alloc(32), 'mainnet');
assert.equal(typeof mainnetEscrowPda.toBase58(), 'string');

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

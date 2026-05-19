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
} = require('./src');

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

assert.throws(
  () => createSATPClient(MAINNET_RPC),
  /Mainnet RPC requires network=mainnet/
);

assert.throws(
  () => createSATPClient({ network: 'mainnet', rpcUrl: MAINNET_RPC }),
  /SATP V3 mainnet program IDs are not configured/
);
assert.throws(
  () => new SATPV3SDK({ rpcUrl: MAINNET_RPC }),
  /Mainnet RPC requires network=mainnet/
);
assert.throws(
  () => new SATPV3SDK({ network: 'mainnet' }),
  /SATP V3 mainnet program IDs are not configured/
);
assert.throws(
  () => getV3ProgramIds('mainnet'),
  /SATP V3 mainnet program IDs are not configured/
);

const v2Default = new SATPSDK();
assert.equal(v2Default.network, 'devnet');
assert.equal(v2Default.rpcUrl, DEVNET_RPC);

const v2Custom = new SATPSDK({ rpcUrl: CUSTOM_RPC });
assert.equal(v2Custom.network, 'devnet');
assert.equal(v2Custom.rpcUrl, CUSTOM_RPC);

const v2MainnetIds = getProgramIds('mainnet');
assert.equal(v2MainnetIds.ESCROW, null);
assert.throws(
  () => getEscrowPDA('11111111111111111111111111111112', Buffer.alloc(32), 'mainnet'),
  /mainnet escrow program ID is not configured/
);

console.log('release safety defaults OK');

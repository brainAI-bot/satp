'use strict';

const assert = require('node:assert/strict');
const dns = require('node:dns');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const tls = require('node:tls');
const web3 = require('@solana/web3.js');
const { createSatpReadonlyRuntime, assertRpcReadOnlyOptIn } = require('../src/satpReadonly');
const { createMockX402Gate } = require('../src/x402Gate');
const { createSatpMcpX402Server } = require('../src/server');

const FIXTURE_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG';
const FIXTURE_HASH = '4d9678a7869c25f26a2e38e43f70fc7d0c4142d20b1743a43e50cd8fd012f3d7';
const originalRpcEnv = process.env.SATP_EXAMPLE_ALLOW_RPC;

let restrictedActionAttempted = false;
function blockRestrictedAction(apiName) {
  return function blockedRestrictedAction() {
    restrictedActionAttempted = true;
    throw new Error('SATP runtime example must stay offline/read-only by default; blocked ' + apiName);
  };
}

http.request = blockRestrictedAction('http.request');
http.get = blockRestrictedAction('http.get');
https.request = blockRestrictedAction('https.request');
https.get = blockRestrictedAction('https.get');
net.connect = blockRestrictedAction('net.connect');
net.createConnection = blockRestrictedAction('net.createConnection');
tls.connect = blockRestrictedAction('tls.connect');
dns.lookup = blockRestrictedAction('dns.lookup');
dns.resolve = blockRestrictedAction('dns.resolve');
web3.Connection.prototype.getAccountInfo = blockRestrictedAction('Connection.getAccountInfo');
web3.Connection.prototype.sendTransaction = blockRestrictedAction('Connection.sendTransaction');
web3.Connection.prototype.sendRawTransaction = blockRestrictedAction('Connection.sendRawTransaction');
web3.Keypair.generate = blockRestrictedAction('Keypair.generate');
web3.Keypair.fromSecretKey = blockRestrictedAction('Keypair.fromSecretKey');
web3.Keypair.fromSeed = blockRestrictedAction('Keypair.fromSeed');

test.after(() => {
  if (originalRpcEnv === undefined) {
    delete process.env.SATP_EXAMPLE_ALLOW_RPC;
  } else {
    process.env.SATP_EXAMPLE_ALLOW_RPC = originalRpcEnv;
  }
});

test('satp.getPrograms returns fixture-matched read-only program IDs', () => {
  const runtime = createSatpReadonlyRuntime();
  const result = runtime.getPrograms({ network: 'devnet' });
  assert.equal(result.mode, 'readonly-fixture');
  assert.equal(result.fixtureMatchesSdk, true);
  assert.equal(result.programs.identity, 'GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG');
});

test('satp.resolveIdentity uses fixtures by default', async () => {
  const runtime = createSatpReadonlyRuntime();
  const result = await runtime.resolveIdentity({ wallet: FIXTURE_WALLET, network: 'devnet' });
  assert.equal(result.mode, 'fixture');
  assert.equal(result.found, true);
  assert.equal(result.identity.displayName, 'Fixture SATP Agent');
});

test('default runtime paths do not use network, RPC, signing, or transaction sends', async () => {
  delete process.env.SATP_EXAMPLE_ALLOW_RPC;
  const runtime = createSatpReadonlyRuntime();
  const server = createSatpMcpX402Server({ runtime, gate: createMockX402Gate() });
  const request = { headers: { 'x-402-fixture': 'satp-fixture-pass' } };

  await server.callTool('satp.getPrograms', { network: 'devnet' }, request);
  await server.callTool('satp.resolveIdentity', { wallet: FIXTURE_WALLET, network: 'devnet' }, request);
  await server.callTool(
    'satp.prepareAttestationRequest',
    { subjectWallet: FIXTURE_WALLET, claimType: 'github_verified', metadataHash: FIXTURE_HASH, network: 'devnet' },
    request
  );

  assert.equal(restrictedActionAttempted, false);
});

test('runtime example loads conformance fixtures for required classifications', () => {
  const runtime = createSatpReadonlyRuntime();
  const result = runtime.getConformanceFixtures();
  const classifications = new Set(result.cases.map((entry) => entry.classification));

  assert.equal(result.mode, 'offline-conformance-fixtures');
  assert.equal(result.allRequiredClassificationsCovered, true);
  assert.equal(result.cases.every((entry) => entry.fixtureMatchesManifest), true);
  for (const classification of ['positive', 'stale', 'revoked', 'malformed', 'unsupported-issuer']) {
    assert.equal(classifications.has(classification), true, `${classification} fixture missing`);
  }
  assert.equal(restrictedActionAttempted, false);
});

test('MCP tool exposes conformance fixture classifications', async () => {
  const server = createSatpMcpX402Server({ gate: createMockX402Gate() });
  const response = await server.callTool(
    'satp.getConformanceFixtures',
    {},
    { headers: { 'x-402-fixture': 'satp-fixture-pass' } }
  );

  assert.equal(response.ok, true);
  assert.equal(response.result.allRequiredClassificationsCovered, true);
  assert.deepEqual(
    response.result.cases.map((entry) => [entry.fixture, entry.classification, entry.expectedVerdict]),
    [
      ['identity-positive.json', 'positive', 'pass'],
      ['trust-packet-positive.json', 'positive', 'pass'],
      ['identity-stale.json', 'stale', 'fail'],
      ['attestation-revoked.json', 'revoked', 'fail'],
      ['attestation-malformed.json', 'malformed', 'fail'],
      ['issuer-unsupported.json', 'unsupported-issuer', 'fail'],
    ]
  );
});

test('satp.prepareAttestationRequest returns unsigned request metadata only', () => {
  const runtime = createSatpReadonlyRuntime();
  const result = runtime.prepareAttestationRequest({
    subjectWallet: FIXTURE_WALLET,
    claimType: 'github_verified',
    metadataHash: FIXTURE_HASH,
    network: 'devnet',
  });
  assert.equal(result.mode, 'offline-readonly-trust-packet');
  assert.equal(result.flags.signingRequired, false);
  assert.equal(result.flags.noTransaction, true);
  assert.equal(result.instructions.length, 0);
  assert.equal(result.subjectWallet, FIXTURE_WALLET);
  assert.match(result.pda.attestation, /^[1-9A-HJ-NP-Za-km-z]+$/);
  assert.equal(result.request.attestationPda, result.pda.attestation);
  assert.equal(result.requestHash, result.request.requestHash);
});

test('RPC resolution requires visible read-only opt-in plus env gate', async () => {
  const runtime = createSatpReadonlyRuntime();
  delete process.env.SATP_EXAMPLE_ALLOW_RPC;

  await assert.rejects(
    () => runtime.resolveIdentity({ wallet: FIXTURE_WALLET, network: 'devnet', mode: 'rpc' }),
    /explicit rpcOptIn/
  );

  await assert.rejects(
    () => runtime.resolveIdentity({
      wallet: FIXTURE_WALLET,
      network: 'devnet',
      mode: 'rpc',
      rpcOptIn: { enabled: true, readOnly: true },
    }),
    /SATP_EXAMPLE_ALLOW_RPC=1/
  );

  assert.throws(
    () => assertRpcReadOnlyOptIn({ enabled: true, readOnly: true, transactions: true }),
    /read-only only/
  );
});

test('explicit RPC opt-in is account-info-only and testable without transaction APIs', async () => {
  process.env.SATP_EXAMPLE_ALLOW_RPC = '1';
  const runtime = createSatpReadonlyRuntime();
  let getAccountInfoCalls = 0;
  const fakeConnection = {
    async getAccountInfo(publicKey) {
      getAccountInfoCalls += 1;
      assert.equal(publicKey.toBase58(), FIXTURE_WALLET);
      return {
        lamports: 123,
        owner: new web3.PublicKey('11111111111111111111111111111111'),
        executable: false,
      };
    },
    sendTransaction: blockRestrictedAction('fakeConnection.sendTransaction'),
    sendRawTransaction: blockRestrictedAction('fakeConnection.sendRawTransaction'),
  };

  const result = await runtime.resolveIdentity({
    wallet: FIXTURE_WALLET,
    network: 'devnet',
    mode: 'rpc',
    rpcOptIn: { enabled: true, readOnly: true },
    connection: fakeConnection,
  });

  assert.equal(getAccountInfoCalls, 1);
  assert.equal(result.mode, 'rpc-readonly');
  assert.deepEqual(result.rpcOptIn, {
    enabled: true,
    readOnly: true,
    accountLookupOnly: true,
    signing: false,
    transactions: false,
    writes: false,
  });
  assert.equal(result.account.lamports, 123);
});

test('mock x402 gate gates MCP tool calls without live payment', async () => {
  const server = createSatpMcpX402Server({ gate: createMockX402Gate() });
  const denied = await server.callTool('satp.getPrograms', {}, { headers: {} });
  assert.equal(denied.ok, false);
  assert.equal(denied.gate.livePayment, false);

  const allowed = await server.callTool('satp.getPrograms', {}, { headers: { 'x-402-fixture': 'satp-fixture-pass' } });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.result.network, 'devnet');
});

test('invalid wallet inputs are rejected before any lookup', async () => {
  const runtime = createSatpReadonlyRuntime();
  await assert.rejects(
    () => runtime.resolveIdentity({ wallet: 'not-a-wallet' }),
    /Invalid wallet/
  );
  assert.throws(
    () => runtime.prepareAttestationRequest({
      subjectWallet: 'not-a-wallet',
      claimType: 'github_verified',
      metadataHash: FIXTURE_HASH,
    }),
    /Invalid subjectWallet/
  );
});

test('example source contains no keypair, transaction-send, publish, or deploy paths', () => {
  const source = [
    fs.readFileSync(path.join(__dirname, '..', 'src', 'satpReadonly.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'src', 'x402Gate.js'), 'utf8'),
  ].join('\n');

  assert.equal(/\bKeypair\b|fromSecretKey|secretKey|sendTransaction|sendRawTransaction|npm publish|\bdeploy\b/i.test(source), false);
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSatpReadonlyRuntime } = require('../src/satpReadonly');
const { createMockX402Gate } = require('../src/x402Gate');
const { createSatpMcpX402Server } = require('../src/server');

const FIXTURE_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG';
const FIXTURE_HASH = '4d9678a7869c25f26a2e38e43f70fc7d0c4142d20b1743a43e50cd8fd012f3d7';

test('satp.getPrograms returns fixture-matched read-only program IDs', () => {
  const runtime = createSatpReadonlyRuntime();
  const result = runtime.getPrograms({ network: 'devnet' });
  assert.equal(result.mode, 'readonly-fixture');
  assert.equal(result.conformance.level, 'SATP-C1');
  assert.equal(result.fixtureMatchesSdk, true);
  assert.equal(result.programs.identity, 'GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG');
});

test('satp.resolveIdentity uses fixtures by default', async () => {
  const runtime = createSatpReadonlyRuntime();
  const result = await runtime.resolveIdentity({ wallet: FIXTURE_WALLET, network: 'devnet' });
  assert.equal(result.mode, 'fixture');
  assert.equal(result.conformance.level, 'SATP-C1');
  assert.equal(result.found, true);
  assert.equal(result.identity.displayName, 'Fixture SATP Agent');
});

test('satp.prepareAttestationRequest returns unsigned request metadata only', () => {
  const runtime = createSatpReadonlyRuntime();
  const result = runtime.prepareAttestationRequest({
    subjectWallet: FIXTURE_WALLET,
    claimType: 'github_verified',
    metadataHash: FIXTURE_HASH,
    network: 'devnet',
  });
  assert.equal(result.mode, 'unsigned-readonly-request');
  assert.equal(result.conformance.level, 'SATP-C2');
  assert.equal(result.instructions.length, 0);
  assert.equal(result.subjectWallet, FIXTURE_WALLET);
  assert.match(result.attestationPda, /^[1-9A-HJ-NP-Za-km-z]+$/);
});

test('mock x402 gate gates MCP tool calls without live payment', async () => {
  const server = createSatpMcpX402Server({ gate: createMockX402Gate() });
  const tools = server.listTools();
  assert.equal(tools.find((tool) => tool.name === 'satp.getPrograms').conformance.level, 'SATP-C1');
  assert.equal(tools.find((tool) => tool.name === 'satp.prepareAttestationRequest').conformance.level, 'SATP-C2');

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

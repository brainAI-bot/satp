#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG';
const FIXTURE_HASH = '4d9678a7869c25f26a2e38e43f70fc7d0c4142d20b1743a43e50cd8fd012f3d7';

const { createSatpMcpX402Server } = require('../examples/mcp-x402-readonly/src/server');
const profile = require('../examples/agentfolio-consumer-readonly/fixtures/agentfolio-profile.json');
const {
  buildAgentFolioSatpConsumerRecord,
  verifyAgentFolioSatpConsumerRecord,
} = require('../examples/agentfolio-consumer-readonly/src/consumerRecord');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function main() {
  const conformanceDoc = readRepoFile('docs/conformance.md');
  for (const requiredText of [
    'SATP-C1',
    'Read-only discovery',
    'SATP-C2',
    'Unsigned attestation preflight',
    'examples/mcp-x402-readonly/',
    'examples/agentfolio-consumer-readonly/',
  ]) {
    assert.equal(conformanceDoc.includes(requiredText), true, 'missing conformance doc text: ' + requiredText);
  }

  const server = createSatpMcpX402Server();
  const tools = server.listTools();
  assert.equal(tools.find((tool) => tool.name === 'satp.getPrograms').conformance.level, 'SATP-C1');
  assert.equal(tools.find((tool) => tool.name === 'satp.resolveIdentity').conformance.level, 'SATP-C1');
  assert.equal(tools.find((tool) => tool.name === 'satp.prepareAttestationRequest').conformance.level, 'SATP-C2');

  const headers = { 'x-402-fixture': 'satp-fixture-pass' };
  const programs = await server.callTool('satp.getPrograms', { network: 'devnet' }, { headers });
  assert.equal(programs.ok, true);
  assert.equal(programs.result.conformance.level, 'SATP-C1');
  assert.equal(programs.result.fixtureMatchesSdk, true);

  const identity = await server.callTool('satp.resolveIdentity', { wallet: FIXTURE_WALLET }, { headers });
  assert.equal(identity.ok, true);
  assert.equal(identity.result.conformance.level, 'SATP-C1');
  assert.equal(identity.result.found, true);

  const attestation = await server.callTool(
    'satp.prepareAttestationRequest',
    {
      subjectWallet: FIXTURE_WALLET,
      claimType: 'github_verified',
      metadataHash: FIXTURE_HASH,
    },
    { headers }
  );
  assert.equal(attestation.ok, true);
  assert.equal(attestation.result.conformance.level, 'SATP-C2');
  assert.equal(attestation.result.signingRequired, false);
  assert.equal(attestation.result.transaction, null);
  assert.deepEqual(attestation.result.instructions, []);

  const record = buildAgentFolioSatpConsumerRecord({ profile });
  assert.equal(record.integration.conformance.level, 'SATP-C2');
  assert.equal(record.integration.signingRequired, false);
  assert.equal(record.integration.writesRequired, false);
  assert.deepEqual(verifyAgentFolioSatpConsumerRecord(record), { ok: true, errors: [] });

  console.log('SATP conformance OK: docs, MCP/x402 SATP-C1/C2, AgentFolio consumer SATP-C2');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

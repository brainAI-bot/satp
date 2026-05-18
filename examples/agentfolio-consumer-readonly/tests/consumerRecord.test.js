'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const profile = require('../fixtures/agentfolio-profile.json');
const {
  buildAgentFolioSatpConsumerRecord,
  verifyAgentFolioSatpConsumerRecord,
} = require('../src/consumerRecord');

test('builds offline SATP trust inputs for an AgentFolio-style consumer', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });

  assert.equal(record.mode, 'offline-readonly-consumer-preflight');
  assert.equal(record.integration.agentfolioRole, 'consumer-adapter');
  assert.equal(record.integration.writesRequired, false);
  assert.equal(record.integration.signingRequired, false);
  assert.equal(record.satp.trustInputs.length, 2);

  for (const input of record.satp.trustInputs) {
    assert.equal(input.request.mode, 'unsigned-readonly-request');
    assert.equal(input.request.signingRequired, false);
    assert.equal(input.request.unsigned, true);
    assert.equal(input.request.transaction, null);
    assert.deepEqual(input.request.instructions, []);
    assert.equal(input.request.subjectWallet, record.satp.subjectWallet);
    assert.equal(input.request.agentId, record.satp.agentId);
    assert.match(input.request.attestationPda, /^[1-9A-HJ-NP-Za-km-z]+$/);
  }
});

test('verifies prepared consumer records without network or signing', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  assert.deepEqual(verifyAgentFolioSatpConsumerRecord(record), { ok: true, errors: [] });
});

test('detects changed trust metadata before an app treats the record as valid', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  record.satp.trustInputs[0].metadata.subject = 'changed-subject';

  const result = verifyAgentFolioSatpConsumerRecord(record);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /metadataHash does not match metadata/);
});

test('rejects invalid profile wallets before preparing requests', () => {
  assert.throws(
    () => buildAgentFolioSatpConsumerRecord({ profile: { ...profile, wallet: 'not-a-wallet' } }),
    /Invalid profile.wallet/
  );
});

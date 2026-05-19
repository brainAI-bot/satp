'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const profile = require('../fixtures/agentfolio-profile.json');
const {
  buildAgentFolioSatpConsumerRecord,
  verifyAgentFolioSatpConsumerRecord,
} = require('../src/consumerRecord');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('builds offline SATP trust inputs for an AgentFolio-style consumer', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });

  assert.equal(record.mode, 'offline-readonly-consumer-preflight');
  assert.equal(record.integration.agentfolioRole, 'consumer-adapter');
  assert.equal(record.integration.conformance.level, 'SATP-C2');
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

test('detects changed consumer conformance level', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  record.integration.conformance.level = 'SATP-C3';

  const result = verifyAgentFolioSatpConsumerRecord(record);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /conformance must stay SATP-C2/);
});

test('detects changed trust metadata before an app treats the record as valid', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  record.satp.trustInputs[0].metadata.subject = 'changed-subject';

  const result = verifyAgentFolioSatpConsumerRecord(record);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /metadataHash does not match metadata/);
});

test('detects tampered derived request attestation PDA', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const tampered = clone(record);
  tampered.satp.trustInputs[0].request.attestationPda = tampered.satp.trustInputs[1].request.attestationPda;

  const result = verifyAgentFolioSatpConsumerRecord(tampered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /request\.attestationPda does not match derived request/);
});

test('detects tampered derived request program IDs', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const tampered = clone(record);
  tampered.satp.trustInputs[0].request.programs.identity = tampered.satp.trustInputs[0].request.programs.attestations;

  const result = verifyAgentFolioSatpConsumerRecord(tampered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /request\.programs does not match derived request/);
});

test('detects tampered derived request hash', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const tampered = clone(record);
  tampered.satp.trustInputs[0].request.requestHash = '0'.repeat(64);

  const result = verifyAgentFolioSatpConsumerRecord(tampered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /request\.requestHash does not match derived request/);
});

test('rejects invalid profile wallets before preparing requests', () => {
  assert.throws(
    () => buildAgentFolioSatpConsumerRecord({ profile: { ...profile, wallet: 'not-a-wallet' } }),
    /Invalid profile.wallet/
  );
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const profile = require('../fixtures/agentfolio-profile.json');
const {
  buildAgentFolioSatpConsumerRecord,
  verifyAgentFolioSatpConsumerRecord,
} = require('../src/consumerRecord');
const {
  buildAgentFolioRuntimePolicyReference,
} = require('../src/runtimePolicyReference');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('builds offline SATP trust inputs for an AgentFolio-style consumer', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });

  assert.equal(record.mode, 'offline-readonly-consumer-preflight');
  assert.equal(record.integration.agentfolioRole, 'consumer-adapter');
  assert.equal(record.integration.writesRequired, false);
  assert.equal(record.integration.signingRequired, false);
  assert.equal(record.satp.trustInputs.length, 2);

  for (const input of record.satp.trustInputs) {
    assert.equal(input.trustPacket.mode, 'offline-readonly-trust-packet');
    assert.equal(input.trustPacket.flags.signingRequired, false);
    assert.equal(input.trustPacket.flags.noTransaction, true);
    assert.equal(input.trustPacket.requestHash, input.request.requestHash);
    assert.equal(input.trustPacket.pda.attestation, input.request.attestationPda);
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

test('builds an AgentFolio runtime policy reference consumer plan', () => {
  const reference = buildAgentFolioRuntimePolicyReference({ profile });

  assert.equal(reference.mode, 'offline-local-reference-consumer-plan');
  assert.equal(reference.recordVerified, true);
  assert.deepEqual(reference.verificationErrors, []);
  assert.equal(reference.action.type, 'agentfolio_trust_gate');
  assert.equal(reference.action.requiresCapability, 'agentfolio:trust-read');
  assert.equal(reference.result.decision, 'allow');
  assert.ok(reference.result.reasonCodes.includes('LOCAL_POLICY_ALLOW'));
  assert.equal(reference.auditTrace.subject.actorId, 'agentfolio-reference-host');
  assert.equal(reference.auditTrace.guardrails.writesSolanaState, false);
  assert.equal(reference.guardrails.publishesPackages, false);
  assert.ok(reference.integrationPlan.some((step) => step.includes('createRuntimePolicyAdapter')));
});

test('AgentFolio runtime policy reference degrades below the local trust threshold', () => {
  const reference = buildAgentFolioRuntimePolicyReference({
    profile,
    trustScore: 62,
  });

  assert.equal(reference.result.decision, 'degrade');
  assert.ok(reference.result.reasonCodes.includes('TRUST_SCORE_BELOW_MINIMUM'));
  assert.equal(reference.action.allowDegraded, true);
  assert.equal(reference.guardrails.livePaymentRequired, false);
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
  assert.match(result.errors.join('\n'), /request invalid: .*attestationPda/);
});

test('detects tampered derived trust packet PDA', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const tampered = clone(record);
  tampered.satp.trustInputs[0].trustPacket.pda.attestation = tampered.satp.trustInputs[1].trustPacket.pda.attestation;

  const result = verifyAgentFolioSatpConsumerRecord(tampered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /trustPacket/);
});

test('detects tampered derived request program IDs', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const tampered = clone(record);
  tampered.satp.trustInputs[0].request.programs.identity = tampered.satp.trustInputs[0].request.programs.attestations;

  const result = verifyAgentFolioSatpConsumerRecord(tampered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /request invalid: .*programs/);
});

test('detects tampered derived request hash', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const tampered = clone(record);
  tampered.satp.trustInputs[0].request.requestHash = '0'.repeat(64);

  const result = verifyAgentFolioSatpConsumerRecord(tampered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /request invalid: .*requestHash/);
});

test('rejects invalid profile wallets before preparing requests', () => {
  assert.throws(
    () => buildAgentFolioSatpConsumerRecord({ profile: { ...profile, wallet: 'not-a-wallet' } }),
    /Invalid profile.wallet/
  );
});

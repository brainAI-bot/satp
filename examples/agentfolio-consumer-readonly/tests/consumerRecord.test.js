'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const profile = require('../fixtures/agentfolio-profile.json');
const {
  buildAgentFolioSatpConsumerRecord,
  verifyAgentFolioSatpConsumerRecord,
} = require('../src/consumerRecord');
const {
  buildAgentFolioRuntimePolicyReference,
} = require('../src/runtimePolicyReference');
const {
  buildAgentFolioReadOnlyView,
} = require('../src/readOnlyConsumerExample');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('builds offline SATP trust inputs for an AgentFolio-style consumer', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });

  assert.equal(record.mode, 'offline-readonly-consumer-preflight');
  assert.equal(record.integration.agentfolioRole, 'consumer-adapter');
  assert.equal(record.integration.rpcRequired, false);
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

test('builds a display-safe read-only AgentFolio view from current SATP APIs', () => {
  const view = buildAgentFolioReadOnlyView({ profile });

  assert.equal(view.mode, 'offline-readonly');
  assert.equal(view.satp.network, 'devnet');
  assert.equal(view.satp.trustInputs.length, 2);
  assert.equal(view.runtimePolicy.recordVerified, true);
  assert.equal(view.runtimePolicy.decision, 'allow');
  assert.ok(view.declaredBoundary);
  assert.equal(Object.hasOwn(view, 'guardrails'), false);

  for (const input of view.satp.trustInputs) {
    assert.match(input.genesisPda, /^[1-9A-HJ-NP-Za-km-z]+$/);
    assert.match(input.attestationPda, /^[1-9A-HJ-NP-Za-km-z]+$/);
    assert.equal(input.unsigned, true);
    assert.equal(input.signingRequired, false);
    assert.equal(input.transaction, null);
    assert.deepEqual(input.instructions, []);
  }
});

test('runs the read-only consumer command and emits parseable JSON', () => {
  const exampleRoot = path.join(__dirname, '..');
  const disableFetchPath = path.join(__dirname, 'disableFetch.js');
  const result = spawnSync(process.execPath, ['--require', disableFetchPath, 'src/readOnlyConsumerExample.js'], {
    cwd: exampleRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.schemaVersion, 'agentfolio.satpReadonlyConsumerExample.v1');
  assert.equal(output.runtimePolicy.recordVerified, true);
  assert.ok(output.declaredBoundary);
});

test('verifies prepared consumer records without network or signing', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  assert.deepEqual(verifyAgentFolioSatpConsumerRecord(record), { ok: true, errors: [] });
});

test('rejects consumer records that require RPC', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  record.integration.rpcRequired = true;

  const result = verifyAgentFolioSatpConsumerRecord(record);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /integration flags must stay offline/);
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

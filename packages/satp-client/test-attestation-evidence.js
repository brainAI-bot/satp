#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  SATP_ATTESTATION_EVIDENCE_REASON_CODES,
  SATP_ATTESTATION_EVIDENCE_SCHEMA_VERSION,
  normalizeSatpAttestationEvidence,
  verifySatpAttestationEvidence,
} = require('./src');

const FIXTURE_DIR = path.join(__dirname, '..', '..', 'tests', 'conformance', 'fixtures', 'attestation-evidence-v0');

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

function mergeNested(base, patch) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = { ...(result[key] || {}), ...value };
    } else {
      result[key] = value;
    }
  }
  return result;
}

function scenario(name) {
  const positive = readFixture('positive.json');
  if (name === 'positive.json') return positive;
  const selected = readFixture(name);
  return {
    input: mergeNested(positive.input, selected.inputPatch),
    options: mergeNested(positive.options, selected.optionsPatch),
    expectedReason: selected.expectedReason,
  };
}

test('normalizes every resolver-controlled binding into a stable offline record', () => {
  const normalized = normalizeSatpAttestationEvidence(scenario('positive.json').input);
  assert.equal(normalized.schemaVersion, SATP_ATTESTATION_EVIDENCE_SCHEMA_VERSION);
  assert.equal(normalized.subject, 'satp:agent:alpha');
  assert.equal(normalized.issuer, 'did:web:issuer.example');
  assert.deepEqual(normalized.evidence.digest, { algorithm: 'sha256', value: 'a'.repeat(64) });
  assert.equal(normalized.evidence.uri, 'https://evidence.example/attestations/alpha');
  assert.equal(normalized.method, 'did-web-v1');
  assert.equal(normalized.freshness.validUntil, '2026-08-26T12:00:00.000Z');
  assert.equal(normalized.revocation.status, 'active');
  assert.equal(normalized.nextCheck.at, '2026-08-26T11:00:00.000Z');
  assert.equal(normalized.nextCheck.refreshAvailable, true);
});

test('positive resolver fixture passes with explicit host trust and evidence bindings', () => {
  const fixture = scenario('positive.json');
  const result = verifySatpAttestationEvidence(fixture.input, fixture.options);
  assert.equal(result.ok, true);
  assert.equal(result.reasonCode, null);
  assert.deepEqual(result.checks, {
    structurallyValid: true,
    subjectMatches: true,
    issuerTrusted: true,
    evidenceBound: true,
    methodSupported: true,
    notRevoked: true,
    fresh: true,
    nextCheckCurrent: true,
  });
  assert.deepEqual(result.guardrails, {
    offlineOnly: true,
    networkRequests: false,
    writesSolanaState: false,
    usesKeypairs: false,
    signsPayloads: false,
    authorizesPayment: false,
  });
});

for (const name of [
  'revoked.json',
  'refresh-unavailable.json',
  'stale.json',
  'unsupported-method.json',
  'untrusted-issuer.json',
  'subject-mismatch.json',
]) {
  test(`${name} fails closed with its stable reason`, () => {
    const fixture = scenario(name);
    const result = verifySatpAttestationEvidence(fixture.input, fixture.options);
    assert.equal(result.ok, false);
    assert.equal(result.reason, fixture.expectedReason);
    assert.equal(result.reasonCode, fixture.expectedReason);
    assert.deepEqual(result.reasonCodes, [fixture.expectedReason]);
  });
}

test('fails closed without explicit host trust, subject, method, digest, or URI context', () => {
  const result = verifySatpAttestationEvidence(scenario('positive.json').input);
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, SATP_ATTESTATION_EVIDENCE_REASON_CODES.SUBJECT_MISMATCH);
});

test('accepts only explicitly supported evidence URI schemes before host trust evaluation', () => {
  const fixture = scenario('positive.json');
  for (const uri of [
    'javascript:alert(1)',
    'data:text/plain,evidence',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://evidence.example/attestations/alpha',
    'wss://evidence.example/attestations/alpha',
    'custom:evidence',
  ]) {
    const input = mergeNested(fixture.input, { evidence: { uri } });
    const result = verifySatpAttestationEvidence(input, {
      ...fixture.options,
      expectedEvidenceUri: uri,
    });
    assert.equal(result.ok, false, uri);
    assert.equal(result.reasonCode, SATP_ATTESTATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE, uri);
  }
});

test('reason values match the public fail-closed contract', () => {
  assert.deepEqual(Object.values(SATP_ATTESTATION_EVIDENCE_REASON_CODES), [
    'invalid-evidence',
    'revoked',
    'refresh-unavailable',
    'stale',
    'unsupported-method',
    'untrusted-issuer',
    'subject-mismatch',
  ]);
});

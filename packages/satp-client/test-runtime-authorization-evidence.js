#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  RUNTIME_AUTHORIZATION_EVIDENCE_SCHEMA_VERSION,
  RUNTIME_AUTHORIZATION_EVIDENCE_PROFILE_ID,
  RUNTIME_AUTHORIZATION_EVIDENCE_PROFILE_VERSION,
  RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES,
  normalizeRuntimeAuthorizationEvidence,
  verifyRuntimeAuthorizationEvidence,
} = require('./src');

const FIXTURE_DIR = path.join(
  __dirname,
  '..',
  '..',
  'tests',
  'conformance',
  'fixtures',
  'runtime-authorization-evidence-v0'
);
const NOW = '2026-08-14T10:30:00.000Z';
const EVIDENCE_DIGEST = 'sha256:' + '1'.repeat(64);
const POLICY_DIGEST = 'sha256:' + '2'.repeat(64);

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

function verificationOptions(overrides = {}) {
  return {
    now: NOW,
    expectedIssuer: 'did:web:issuer.example',
    expectedVerifier: 'offline-verifier:primary',
    expectedSubject: 'satp:agent:brainchain-demo',
    expectedAudience: 'runtime:mcp-host',
    expectedResource: 'mcp://tools/reputation.read',
    expectedEvidenceDigest: EVIDENCE_DIGEST,
    expectedPolicyDigest: POLICY_DIGEST,
    requiredScopes: ['evidence:read', 'reputation:read'],
    availableVerifiers: new Set(['offline-verifier:primary']),
    ...overrides,
  };
}

test('normalizes profile, principals, bindings, digests, timestamps, and scope deterministically', () => {
  const normalized = normalizeRuntimeAuthorizationEvidence(
    fixture('runtime-authorization-evidence-positive.json')
  );

  assert.deepEqual(normalized, {
    schemaVersion: RUNTIME_AUTHORIZATION_EVIDENCE_SCHEMA_VERSION,
    profile: {
      id: RUNTIME_AUTHORIZATION_EVIDENCE_PROFILE_ID,
      version: RUNTIME_AUTHORIZATION_EVIDENCE_PROFILE_VERSION,
    },
    issuer: 'did:web:issuer.example',
    verifier: 'offline-verifier:primary',
    subject: 'satp:agent:brainchain-demo',
    audience: 'runtime:mcp-host',
    resource: 'mcp://tools/reputation.read',
    evidenceDigest: { algorithm: 'sha256', value: '1'.repeat(64) },
    observedAt: '2026-08-14T10:00:00.000Z',
    expiresAt: '2026-08-14T11:00:00.000Z',
    authorizationScope: ['evidence:read', 'reputation:read'],
    policyDigest: { algorithm: 'sha256', value: '2'.repeat(64) },
  });
});

test('verifies a fully bound authorization with an explicit offline verifier set', () => {
  const result = verifyRuntimeAuthorizationEvidence(
    fixture('runtime-authorization-evidence-positive.json'),
    verificationOptions()
  );

  assert.equal(result.ok, true);
  assert.equal(result.reasonCode, null);
  assert.deepEqual(result.reasonCodes, []);
  assert.deepEqual(result.checks, {
    profileSupported: true,
    structurallyValid: true,
    authorizationCurrent: true,
    scopeMatches: true,
    verifierAvailable: true,
  });
  assert.deepEqual(result.guardrails, {
    offlineOnly: true,
    networkRequests: false,
    writesSolanaState: false,
    usesKeypairs: false,
    authorizesPayment: false,
  });
});

for (const scenario of [
  {
    name: 'unsupported profile',
    fixture: 'runtime-authorization-evidence-unsupported-profile.json',
    reasonCode: RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.UNSUPPORTED_PROFILE,
  },
  {
    name: 'invalid evidence',
    fixture: 'runtime-authorization-evidence-invalid.json',
    reasonCode: RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE,
  },
  {
    name: 'expired authorization',
    fixture: 'runtime-authorization-evidence-expired.json',
    reasonCode: RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.AUTHORIZATION_EXPIRED,
  },
  {
    name: 'scope mismatch',
    fixture: 'runtime-authorization-evidence-scope-mismatch.json',
    reasonCode: RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.SCOPE_MISMATCH,
  },
  {
    name: 'unavailable verifier',
    fixture: 'runtime-authorization-evidence-verifier-unavailable.json',
    reasonCode: RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.VERIFIER_UNAVAILABLE,
  },
]) {
  test(`fails closed with ${scenario.reasonCode} for ${scenario.name}`, () => {
    const result = verifyRuntimeAuthorizationEvidence(fixture(scenario.fixture), verificationOptions());
    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, scenario.reasonCode);
    assert.deepEqual(result.reasonCodes, [scenario.reasonCode]);
  });
}

test('fails closed when no offline verifier trust root is supplied', () => {
  const result = verifyRuntimeAuthorizationEvidence(
    fixture('runtime-authorization-evidence-positive.json'),
    verificationOptions({ availableVerifiers: undefined })
  );
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.VERIFIER_UNAVAILABLE);
});

test('does not trust inherited verifier-record entries', () => {
  const inheritedTrust = Object.create({ 'offline-verifier:primary': true });
  const result = verifyRuntimeAuthorizationEvidence(
    fixture('runtime-authorization-evidence-positive.json'),
    verificationOptions({ availableVerifiers: inheritedTrust })
  );
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.VERIFIER_UNAVAILABLE);
});

test('maps evidence and issuer digest mismatches to invalid_evidence', () => {
  for (const options of [
    { expectedEvidenceDigest: 'sha256:' + '3'.repeat(64) },
    { expectedIssuer: 'did:web:different.example' },
  ]) {
    const result = verifyRuntimeAuthorizationEvidence(
      fixture('runtime-authorization-evidence-positive.json'),
      verificationOptions(options)
    );
    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE);
  }
});

test('maps subject, audience, resource, scope, and policy bindings to scope_mismatch', () => {
  for (const options of [
    { expectedSubject: 'satp:agent:other' },
    { expectedAudience: 'runtime:other-host' },
    { expectedResource: 'mcp://tools/other.read' },
    { requiredScopes: ['reputation:admin'] },
    { expectedPolicyDigest: 'sha256:' + '3'.repeat(64) },
  ]) {
    const result = verifyRuntimeAuthorizationEvidence(
      fixture('runtime-authorization-evidence-positive.json'),
      verificationOptions(options)
    );
    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.SCOPE_MISMATCH);
  }
});

test('rejects future observations and an invalid verification clock as invalid_evidence', () => {
  const positive = fixture('runtime-authorization-evidence-positive.json');
  const futureObserved = {
    ...positive,
    evidence: { ...positive.evidence, observed_at: '2026-08-14T10:31:00.000Z' },
  };
  for (const [input, options] of [
    [futureObserved, verificationOptions()],
    [positive, verificationOptions({ now: 'not-a-date' })],
  ]) {
    const result = verifyRuntimeAuthorizationEvidence(input, options);
    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE);
  }
});

test('reason-code values match the public fail-closed contract', () => {
  assert.deepEqual(Object.values(RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES), [
    'unsupported_profile',
    'invalid_evidence',
    'authorization_expired',
    'scope_mismatch',
    'verifier_unavailable',
  ]);
});

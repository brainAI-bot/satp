'use strict';

const { verifyBundle } = require('./runtimeVerifier');

const EXTERNAL_ADAPTER_CASE_SCHEMA = 'satp.external-fixture-adapter.case.v1';
const EXTERNAL_ADAPTER_PROFILE = 'satp.external-fixture-adapter.v1';
const FIXTURE_KEYS = ['identity', 'attestation', 'trustPacket'];
const EXPECTATION_KEYS = [
  'expectedSubject',
  'expectedEvidenceDigest',
  'expectedEvidenceUri',
];

function assertFixtureName(value, key) {
  if (typeof value !== 'string' || !/^[a-z0-9-]+\.json$/.test(value)) {
    throw new Error('Invalid ' + key + ' fixture name');
  }
}

function assertExpectations(expectations) {
  if (!expectations || typeof expectations !== 'object') {
    throw new Error('External adapter expectations are required');
  }
  const unknownExpectation = Object.keys(expectations).find(
    (key) => !EXPECTATION_KEYS.includes(key)
  );
  if (unknownExpectation) {
    throw new Error('External adapter unknown expectation: ' + unknownExpectation);
  }
  if (typeof expectations.expectedSubject !== 'string' || expectations.expectedSubject.length === 0) {
    throw new Error('External adapter expectedSubject is required');
  }
  if (!/^[a-f0-9]{64}$/.test(expectations.expectedEvidenceDigest || '')) {
    throw new Error('External adapter expectedEvidenceDigest must be a 32-byte lowercase hex hash');
  }
  if (
    typeof expectations.expectedEvidenceUri !== 'string' ||
    expectations.expectedEvidenceUri.length === 0
  ) {
    throw new Error('External adapter expectedEvidenceUri is required');
  }
}

function assertCaseDefinition(caseDefinition) {
  if (!caseDefinition || typeof caseDefinition !== 'object') {
    throw new Error('External adapter case must be an object');
  }
  if (caseDefinition.schemaVersion !== EXTERNAL_ADAPTER_CASE_SCHEMA) {
    throw new Error('Unsupported external adapter case schema');
  }
  if (typeof caseDefinition.caseId !== 'string' || caseDefinition.caseId.length === 0) {
    throw new Error('External adapter caseId is required');
  }
  if (!caseDefinition.fixtures || typeof caseDefinition.fixtures !== 'object') {
    throw new Error('External adapter fixtures are required');
  }
  for (const key of FIXTURE_KEYS) {
    assertFixtureName(caseDefinition.fixtures[key], key);
  }
  assertExpectations(caseDefinition.expectations);
}

function unwrapFixture(key, fixture) {
  if (!fixture || typeof fixture !== 'object' || !fixture.record) {
    throw new Error(key + ' fixture must contain a record');
  }
  if (key === 'trustPacket') {
    if (!fixture.record.packet || typeof fixture.record.packet !== 'object') {
      throw new Error('trustPacket fixture record must contain a packet');
    }
    return fixture.record.packet;
  }
  return fixture.record;
}

function createFixtureFirstExternalAdapter({ loadFixture, verifier = verifyBundle } = {}) {
  if (typeof loadFixture !== 'function') {
    throw new Error('createFixtureFirstExternalAdapter requires loadFixture');
  }
  if (typeof verifier !== 'function') {
    throw new Error('createFixtureFirstExternalAdapter requires a verifier function');
  }

  const boundary = Object.freeze({
    externalConsumerOwned: true,
    agentFolioRuntimeRequired: false,
    agentFolioApiRequired: false,
    networkAccessRequired: false,
    signingRequired: false,
    transactionRequired: false,
    writesRequired: false,
    paymentRequired: false,
    authorizationGranted: false,
  });

  return Object.freeze({
    profile: EXTERNAL_ADAPTER_PROFILE,
    boundary,
    verifyCase(caseDefinition) {
      assertCaseDefinition(caseDefinition);

      const loaded = Object.fromEntries(
        FIXTURE_KEYS.map((key) => [key, loadFixture(caseDefinition.fixtures[key])])
      );
      const bundle = Object.fromEntries(
        FIXTURE_KEYS.map((key) => [key, unwrapFixture(key, loaded[key])])
      );
      const verification = verifier(bundle, {
        expectedSubject: caseDefinition.expectations.expectedSubject,
        expectedEvidenceDigest: caseDefinition.expectations.expectedEvidenceDigest,
        expectedEvidenceUri: caseDefinition.expectations.expectedEvidenceUri,
      });

      return {
        schemaVersion: EXTERNAL_ADAPTER_PROFILE,
        caseId: caseDefinition.caseId,
        status: verification.ok ? 'conformant' : 'non_conformant',
        ok: verification.ok,
        errors: verification.errors,
        checks: {
          identity: verification.identity.ok,
          attestation: verification.attestation.ok,
          trustPacket: verification.trustPacket.ok,
        },
        boundary,
      };
    },
  });
}

module.exports = {
  createFixtureFirstExternalAdapter,
  EXTERNAL_ADAPTER_CASE_SCHEMA,
  EXTERNAL_ADAPTER_PROFILE,
};

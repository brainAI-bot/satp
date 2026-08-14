'use strict';

const RUNTIME_AUTHORIZATION_EVIDENCE_SCHEMA_VERSION = 'satp.runtimeAuthorizationEvidence.v0';
const RUNTIME_AUTHORIZATION_EVIDENCE_PROFILE_ID = 'satp.runtimeAuthorizationEvidence';
const RUNTIME_AUTHORIZATION_EVIDENCE_PROFILE_VERSION = '0';

const RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES = Object.freeze({
  UNSUPPORTED_PROFILE: 'unsupported_profile',
  INVALID_EVIDENCE: 'invalid_evidence',
  AUTHORIZATION_EXPIRED: 'authorization_expired',
  SCOPE_MISMATCH: 'scope_mismatch',
  VERIFIER_UNAVAILABLE: 'verifier_unavailable',
});

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function normalizeString(value, field) {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? firstDefined(value.id, value.value)
    : value;
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return candidate.trim();
}

function normalizeProfile(input) {
  const profile = input.profile && typeof input.profile === 'object' && !Array.isArray(input.profile)
    ? input.profile
    : {};
  const version = firstDefined(profile.version, input.profileVersion, input.profile_version);
  return {
    id: normalizeString(
      firstDefined(profile.id, input.profileId, input.profile_id),
      'profile.id'
    ),
    version: normalizeString(typeof version === 'number' ? String(version) : version, 'profile.version'),
  };
}

function readProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const profile = input.profile && typeof input.profile === 'object' && !Array.isArray(input.profile)
    ? input.profile
    : {};
  const id = firstDefined(profile.id, input.profileId, input.profile_id);
  const version = firstDefined(profile.version, input.profileVersion, input.profile_version);
  return {
    id: typeof id === 'string' ? id.trim() : null,
    version: typeof version === 'string' || typeof version === 'number' ? String(version).trim() : null,
  };
}

function normalizeDigest(value, field) {
  let algorithm;
  let digest;
  if (typeof value === 'string') {
    const match = value.trim().match(/^([a-z0-9-]+):([a-fA-F0-9]+)$/);
    if (!match) throw new Error(`${field} must use algorithm:hex form or an object`);
    [, algorithm, digest] = match;
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    algorithm = firstDefined(value.algorithm, value.alg);
    digest = firstDefined(value.value, value.digest, value.hex);
  } else {
    throw new Error(`${field} must be a digest object or algorithm:hex string`);
  }

  algorithm = normalizeString(algorithm, `${field}.algorithm`).toLowerCase();
  digest = normalizeString(digest, `${field}.value`).toLowerCase();
  if (algorithm !== 'sha256') throw new Error(`${field}.algorithm must be sha256`);
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${field}.value must be 64 hexadecimal characters`);
  return { algorithm, value: digest };
}

function normalizeTimestamp(value, field) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${field} is required`);
  }
  const timestamp = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error(`${field} must be a valid timestamp`);
  return timestamp.toISOString();
}

function normalizeScope(value) {
  const raw = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('authorizationScope must be a non-empty string array');
  }
  const normalized = raw.map((item) => normalizeString(item, 'authorizationScope item'));
  return Array.from(new Set(normalized)).sort();
}

function normalizeRuntimeAuthorizationEvidence(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('runtime authorization evidence must be an object');
  }

  const authorization = input.authorization && typeof input.authorization === 'object' && !Array.isArray(input.authorization)
    ? input.authorization
    : {};
  const evidence = input.evidence && typeof input.evidence === 'object' && !Array.isArray(input.evidence)
    ? input.evidence
    : {};
  const policy = input.policy && typeof input.policy === 'object' && !Array.isArray(input.policy)
    ? input.policy
    : {};

  const normalized = {
    schemaVersion: normalizeString(
      firstDefined(input.schemaVersion, input.schema_version),
      'schemaVersion'
    ),
    profile: normalizeProfile(input),
    issuer: normalizeString(firstDefined(input.issuer, input.issuer_id, input.issuerId), 'issuer'),
    verifier: normalizeString(firstDefined(input.verifier, input.verifier_id, input.verifierId), 'verifier'),
    subject: normalizeString(firstDefined(input.subject, input.subject_id, input.subjectId), 'subject'),
    audience: normalizeString(firstDefined(input.audience, input.audience_id, input.audienceId), 'audience'),
    resource: normalizeString(input.resource, 'resource'),
    evidenceDigest: normalizeDigest(
      firstDefined(input.evidenceDigest, input.evidence_digest, evidence.digest),
      'evidenceDigest'
    ),
    observedAt: normalizeTimestamp(
      firstDefined(input.observedAt, input.observed_at, evidence.observedAt, evidence.observed_at),
      'observedAt'
    ),
    expiresAt: normalizeTimestamp(
      firstDefined(input.expiresAt, input.expires_at, authorization.expiresAt, authorization.expires_at),
      'expiresAt'
    ),
    authorizationScope: normalizeScope(
      firstDefined(input.authorizationScope, input.authorization_scope, authorization.scope)
    ),
    policyDigest: normalizeDigest(
      firstDefined(input.policyDigest, input.policy_digest, policy.digest),
      'policyDigest'
    ),
  };

  if (normalized.schemaVersion !== RUNTIME_AUTHORIZATION_EVIDENCE_SCHEMA_VERSION) {
    throw new Error(`schemaVersion must be ${RUNTIME_AUTHORIZATION_EVIDENCE_SCHEMA_VERSION}`);
  }
  if (new Date(normalized.expiresAt).getTime() <= new Date(normalized.observedAt).getTime()) {
    throw new Error('expiresAt must be after observedAt');
  }

  return normalized;
}

function normalizeExpectedDigest(value, field) {
  return value === undefined ? null : normalizeDigest(value, field);
}

function digestMatches(actual, expected) {
  return !expected || (actual.algorithm === expected.algorithm && actual.value === expected.value);
}

function normalizeRequiredScopes(options) {
  const value = firstDefined(options.requiredScopes, options.requiredScope);
  if (value === undefined) return [];
  return normalizeScope(value);
}

function verifierIsAvailable(availableVerifiers, verifier) {
  if (typeof availableVerifiers === 'string') return availableVerifiers === verifier;
  if (Array.isArray(availableVerifiers)) return availableVerifiers.includes(verifier);
  if (availableVerifiers instanceof Set) return availableVerifiers.has(verifier);
  if (availableVerifiers && typeof availableVerifiers === 'object') {
    return availableVerifiers[verifier] === true;
  }
  return false;
}

function failure(reasonCode, message, evidence, checks) {
  return {
    ok: false,
    reasonCode,
    reasonCodes: [reasonCode],
    message,
    evidence,
    checks,
    guardrails: guardrails(),
  };
}

function guardrails() {
  return {
    offlineOnly: true,
    networkRequests: false,
    writesSolanaState: false,
    usesKeypairs: false,
    authorizesPayment: false,
  };
}

function verifyRuntimeAuthorizationEvidence(input, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return failure(
      RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE,
      'verification options must be an object',
      null,
      { profileSupported: false, structurallyValid: false }
    );
  }

  const checks = {
    profileSupported: false,
    structurallyValid: false,
    authorizationCurrent: false,
    scopeMatches: false,
    verifierAvailable: false,
  };
  const profile = readProfile(input);
  const expectedProfileId = firstDefined(options.expectedProfileId, RUNTIME_AUTHORIZATION_EVIDENCE_PROFILE_ID);
  const expectedProfileVersion = String(firstDefined(
    options.expectedProfileVersion,
    RUNTIME_AUTHORIZATION_EVIDENCE_PROFILE_VERSION
  ));

  if (!profile || profile.id !== expectedProfileId || profile.version !== expectedProfileVersion) {
    return failure(
      RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.UNSUPPORTED_PROFILE,
      `profile must be ${expectedProfileId}@${expectedProfileVersion}`,
      null,
      checks
    );
  }
  checks.profileSupported = true;

  let evidence;
  try {
    evidence = normalizeRuntimeAuthorizationEvidence(input);
    const expectedEvidenceDigest = normalizeExpectedDigest(options.expectedEvidenceDigest, 'expectedEvidenceDigest');
    if (!digestMatches(evidence.evidenceDigest, expectedEvidenceDigest)) {
      throw new Error('evidenceDigest does not match expected evidence digest');
    }
    if (options.expectedIssuer !== undefined && evidence.issuer !== normalizeString(options.expectedIssuer, 'expectedIssuer')) {
      throw new Error('issuer does not match expected issuer');
    }
  } catch (error) {
    return failure(
      RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE,
      error.message,
      null,
      checks
    );
  }
  checks.structurallyValid = true;

  let now;
  try {
    now = options.now === undefined ? new Date() : new Date(options.now);
    if (Number.isNaN(now.getTime())) throw new Error('now must be a valid timestamp');
    if (new Date(evidence.observedAt).getTime() > now.getTime()) {
      throw new Error('observedAt must not be in the future');
    }
  } catch (error) {
    return failure(
      RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE,
      error.message,
      evidence,
      checks
    );
  }

  if (new Date(evidence.expiresAt).getTime() <= now.getTime()) {
    return failure(
      RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.AUTHORIZATION_EXPIRED,
      'runtime authorization evidence is expired',
      evidence,
      checks
    );
  }
  checks.authorizationCurrent = true;

  try {
    const requiredScopes = normalizeRequiredScopes(options);
    const expectedPolicyDigest = normalizeExpectedDigest(options.expectedPolicyDigest, 'expectedPolicyDigest');
    const contextMatches = [
      ['expectedSubject', evidence.subject],
      ['expectedAudience', evidence.audience],
      ['expectedResource', evidence.resource],
    ].every(([key, actual]) => options[key] === undefined || normalizeString(options[key], key) === actual);
    const scopesMatch = requiredScopes.every((scope) => evidence.authorizationScope.includes(scope));
    const policyMatches = digestMatches(evidence.policyDigest, expectedPolicyDigest);
    checks.scopeMatches = contextMatches && scopesMatch && policyMatches;
  } catch (error) {
    return failure(
      RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE,
      error.message,
      evidence,
      checks
    );
  }

  if (!checks.scopeMatches) {
    return failure(
      RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.SCOPE_MISMATCH,
      'subject, audience, resource, authorization scope, or policy digest does not match the requested context',
      evidence,
      checks
    );
  }

  let expectedVerifier;
  try {
    expectedVerifier = options.expectedVerifier === undefined
      ? evidence.verifier
      : normalizeString(options.expectedVerifier, 'expectedVerifier');
  } catch (error) {
    return failure(
      RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE,
      error.message,
      evidence,
      checks
    );
  }
  checks.verifierAvailable = evidence.verifier === expectedVerifier
    && verifierIsAvailable(options.availableVerifiers, evidence.verifier);
  if (!checks.verifierAvailable) {
    return failure(
      RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES.VERIFIER_UNAVAILABLE,
      'the named verifier is not available in the explicit offline verifier set',
      evidence,
      checks
    );
  }

  return {
    ok: true,
    reasonCode: null,
    reasonCodes: [],
    message: 'Runtime authorization evidence verified for the requested offline context.',
    evidence,
    checks,
    guardrails: guardrails(),
  };
}

module.exports = {
  RUNTIME_AUTHORIZATION_EVIDENCE_SCHEMA_VERSION,
  RUNTIME_AUTHORIZATION_EVIDENCE_PROFILE_ID,
  RUNTIME_AUTHORIZATION_EVIDENCE_PROFILE_VERSION,
  RUNTIME_AUTHORIZATION_EVIDENCE_REASON_CODES,
  normalizeRuntimeAuthorizationEvidence,
  verifyRuntimeAuthorizationEvidence,
};

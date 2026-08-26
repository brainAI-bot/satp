'use strict';

const SATP_ATTESTATION_EVIDENCE_SCHEMA_VERSION = 'satp.attestationEvidence.v0';

const SATP_ATTESTATION_EVIDENCE_REASON_CODES = Object.freeze({
  INVALID_EVIDENCE: 'invalid-evidence',
  REVOKED: 'revoked',
  REFRESH_UNAVAILABLE: 'refresh-unavailable',
  STALE: 'stale',
  UNSUPPORTED_METHOD: 'unsupported-method',
  UNTRUSTED_ISSUER: 'untrusted-issuer',
  SUBJECT_MISMATCH: 'subject-mismatch',
});

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeString(value, field) {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? firstDefined(value.id, value.value, value.uri)
    : value;
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return candidate.trim();
}

function normalizeDigest(value) {
  let algorithm;
  let digest;
  if (typeof value === 'string') {
    const match = value.trim().match(/^([a-z0-9-]+):([a-fA-F0-9]+)$/);
    if (match) [, algorithm, digest] = match;
    else {
      algorithm = 'sha256';
      digest = value.trim();
    }
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    algorithm = firstDefined(value.algorithm, value.alg, 'sha256');
    digest = firstDefined(value.value, value.digest, value.hex);
  } else {
    throw new Error('evidence.digest must be a sha256 digest object or string');
  }
  algorithm = normalizeString(algorithm, 'evidence.digest.algorithm').toLowerCase();
  digest = normalizeString(digest, 'evidence.digest.value').toLowerCase();
  if (algorithm !== 'sha256') throw new Error('evidence.digest.algorithm must be sha256');
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error('evidence.digest.value must be 64 hexadecimal characters');
  }
  return { algorithm, value: digest };
}

function normalizeUri(value) {
  const uri = normalizeString(value, 'evidence.uri');
  let parsed;
  try {
    parsed = new URL(uri);
  } catch (_) {
    throw new Error('evidence.uri must be an absolute URI');
  }
  const scheme = parsed.protocol.toLowerCase();
  if (!scheme || ['javascript:', 'data:', 'vbscript:'].includes(scheme)) {
    throw new Error('evidence.uri must use a non-executable absolute URI scheme');
  }
  return uri;
}

function normalizeTimestamp(value, field) {
  if (value === undefined || value === null || value === '') throw new Error(`${field} is required`);
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid timestamp`);
  return date.toISOString();
}

function normalizeRevocationStatus(value) {
  if (value === true) return 'revoked';
  if (value === false) return 'active';
  const status = normalizeString(value, 'revocation.status').toLowerCase();
  if (!['active', 'revoked'].includes(status)) {
    throw new Error('revocation.status must be active or revoked');
  }
  return status;
}

function normalizeSatpAttestationEvidence(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('SATP attestation evidence resolver output must be an object');
  }
  const evidence = objectOrEmpty(input.evidence);
  const freshness = objectOrEmpty(input.freshness);
  const revocation = objectOrEmpty(input.revocation);
  const nextCheck = objectOrEmpty(firstDefined(input.nextCheck, input.next_check));
  const schemaVersion = normalizeString(
    firstDefined(input.schemaVersion, input.schema_version),
    'schemaVersion'
  );
  if (schemaVersion !== SATP_ATTESTATION_EVIDENCE_SCHEMA_VERSION) {
    throw new Error(`schemaVersion must be ${SATP_ATTESTATION_EVIDENCE_SCHEMA_VERSION}`);
  }

  const normalized = {
    schemaVersion,
    subject: normalizeString(firstDefined(input.subject, input.subjectId, input.subject_id), 'subject'),
    issuer: normalizeString(firstDefined(input.issuer, input.issuerId, input.issuer_id), 'issuer'),
    evidence: {
      digest: normalizeDigest(firstDefined(evidence.digest, input.evidenceDigest, input.evidence_digest)),
      uri: normalizeUri(firstDefined(evidence.uri, input.evidenceUri, input.evidence_uri)),
    },
    method: normalizeString(firstDefined(input.method, input.verificationMethod, input.verification_method), 'method'),
    freshness: {
      observedAt: normalizeTimestamp(
        firstDefined(freshness.observedAt, freshness.observed_at, input.observedAt, input.observed_at),
        'freshness.observedAt'
      ),
      validUntil: normalizeTimestamp(
        firstDefined(freshness.validUntil, freshness.valid_until, input.validUntil, input.valid_until, input.expiresAt, input.expires_at),
        'freshness.validUntil'
      ),
    },
    revocation: {
      status: normalizeRevocationStatus(firstDefined(revocation.status, input.revoked)),
      checkedAt: normalizeTimestamp(
        firstDefined(revocation.checkedAt, revocation.checked_at, input.revocationCheckedAt, input.revocation_checked_at),
        'revocation.checkedAt'
      ),
    },
    nextCheck: {
      at: normalizeTimestamp(
        firstDefined(nextCheck.at, nextCheck.nextCheckAt, nextCheck.next_check_at, input.nextCheckAt, input.next_check_at),
        'nextCheck.at'
      ),
      refreshAvailable: firstDefined(
        nextCheck.refreshAvailable,
        nextCheck.refresh_available,
        input.refreshAvailable,
        input.refresh_available
      ),
    },
  };

  if (typeof normalized.nextCheck.refreshAvailable !== 'boolean') {
    throw new Error('nextCheck.refreshAvailable must be a boolean');
  }
  const observedAt = Date.parse(normalized.freshness.observedAt);
  const validUntil = Date.parse(normalized.freshness.validUntil);
  const revocationCheckedAt = Date.parse(normalized.revocation.checkedAt);
  const nextCheckAt = Date.parse(normalized.nextCheck.at);
  if (validUntil <= observedAt) throw new Error('freshness.validUntil must be after freshness.observedAt');
  if (revocationCheckedAt < observedAt) {
    throw new Error('revocation.checkedAt must not precede freshness.observedAt');
  }
  if (nextCheckAt < revocationCheckedAt || nextCheckAt > validUntil) {
    throw new Error('nextCheck.at must be between revocation.checkedAt and freshness.validUntil');
  }
  return normalized;
}

function normalizeSet(value, field) {
  const values = typeof value === 'string' ? [value] : value instanceof Set ? [...value] : value;
  if (!Array.isArray(values) || values.length === 0) return new Set();
  return new Set(values.map((entry) => normalizeString(entry, field)));
}

function digestEqual(left, right) {
  return left.algorithm === right.algorithm && left.value === right.value;
}

function guardrails() {
  return {
    offlineOnly: true,
    networkRequests: false,
    writesSolanaState: false,
    usesKeypairs: false,
    signsPayloads: false,
    authorizesPayment: false,
  };
}

function failure(reasonCode, message, evidence, checks) {
  return {
    ok: false,
    reason: reasonCode,
    reasonCode,
    reasonCodes: [reasonCode],
    message,
    evidence,
    checks,
    guardrails: guardrails(),
  };
}

function verifySatpAttestationEvidence(input, options = {}) {
  const checks = {
    structurallyValid: false,
    subjectMatches: false,
    issuerTrusted: false,
    evidenceBound: false,
    methodSupported: false,
    notRevoked: false,
    fresh: false,
    nextCheckCurrent: false,
  };
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE, 'verification options must be an object', null, checks);
  }

  let normalized;
  try {
    normalized = normalizeSatpAttestationEvidence(input);
  } catch (error) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE, error.message, null, checks);
  }
  checks.structurallyValid = true;

  let expectedSubject;
  try {
    expectedSubject = normalizeString(options.expectedSubject, 'expectedSubject');
  } catch (_) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.SUBJECT_MISMATCH, 'an explicit expectedSubject is required', normalized, checks);
  }
  checks.subjectMatches = normalized.subject === expectedSubject;
  if (!checks.subjectMatches) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.SUBJECT_MISMATCH, 'attestation subject does not match the expected subject', normalized, checks);
  }

  let trustedIssuers;
  try {
    trustedIssuers = normalizeSet(options.trustedIssuers, 'trustedIssuers entry');
  } catch (error) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE, error.message, normalized, checks);
  }
  checks.issuerTrusted = trustedIssuers.has(normalized.issuer);
  if (!checks.issuerTrusted) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.UNTRUSTED_ISSUER, 'attestation issuer is absent from the host-supplied trust set', normalized, checks);
  }

  try {
    if (options.expectedEvidenceDigest === undefined || options.expectedEvidenceUri === undefined) {
      throw new Error('expectedEvidenceDigest and expectedEvidenceUri are required');
    }
    const expectedDigest = normalizeDigest(options.expectedEvidenceDigest);
    const expectedUri = normalizeUri(options.expectedEvidenceUri);
    checks.evidenceBound = digestEqual(normalized.evidence.digest, expectedDigest)
      && normalized.evidence.uri === expectedUri;
  } catch (error) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE, error.message, normalized, checks);
  }
  if (!checks.evidenceBound) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE, 'evidence digest or URI does not match the expected evidence binding', normalized, checks);
  }

  let supportedMethods;
  try {
    supportedMethods = normalizeSet(options.supportedMethods, 'supportedMethods entry');
  } catch (error) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE, error.message, normalized, checks);
  }
  checks.methodSupported = supportedMethods.has(normalized.method);
  if (!checks.methodSupported) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.UNSUPPORTED_METHOD, 'attestation method is absent from the host-supplied supported method set', normalized, checks);
  }

  checks.notRevoked = normalized.revocation.status === 'active';
  if (!checks.notRevoked) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.REVOKED, 'attestation resolver output reports revoked state', normalized, checks);
  }

  let now;
  try {
    now = options.now === undefined ? new Date() : new Date(options.now);
    if (Number.isNaN(now.getTime())) throw new Error('now must be a valid timestamp');
  } catch (error) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.INVALID_EVIDENCE, error.message, normalized, checks);
  }
  const nowMs = now.getTime();
  const observedAt = Date.parse(normalized.freshness.observedAt);
  const validUntil = Date.parse(normalized.freshness.validUntil);
  const revocationCheckedAt = Date.parse(normalized.revocation.checkedAt);
  const nextCheckAt = Date.parse(normalized.nextCheck.at);
  if (observedAt > nowMs || revocationCheckedAt > nowMs || validUntil <= nowMs) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.STALE, 'attestation evidence or revocation state is outside its freshness window', normalized, checks);
  }
  checks.fresh = true;

  checks.nextCheckCurrent = nextCheckAt > nowMs;
  if (!checks.nextCheckCurrent && !normalized.nextCheck.refreshAvailable) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.REFRESH_UNAVAILABLE, 'the next check is due and the host resolver reports refresh unavailable', normalized, checks);
  }
  if (!checks.nextCheckCurrent) {
    return failure(SATP_ATTESTATION_EVIDENCE_REASON_CODES.STALE, 'the host-supplied next check is due', normalized, checks);
  }

  return {
    ok: true,
    reason: null,
    reasonCode: null,
    reasonCodes: [],
    message: 'SATP attestation evidence verified for the requested offline context.',
    evidence: normalized,
    checks,
    guardrails: guardrails(),
  };
}

module.exports = {
  SATP_ATTESTATION_EVIDENCE_SCHEMA_VERSION,
  SATP_ATTESTATION_EVIDENCE_REASON_CODES,
  normalizeSatpAttestationEvidence,
  verifySatpAttestationEvidence,
};

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PublicKey } = require('@solana/web3.js');
const {
  buildSatpTrustPacket,
  getGenesisPDA,
  getV3AttestationPDA,
  hashAgentId,
  validateSatpTrustPacket,
} = require('../../../packages/satp-client/src');

const DEFAULT_NETWORK = 'devnet';
const DEFAULT_VALIDATION_TIME = 1767139200;
const FIXTURE_DIR = path.join(__dirname, '..', '..', '..', 'tests', 'conformance', 'fixtures');
const SUPPORTED_ISSUER_TRUST_CLASSES = new Set(['self', 'platform', 'protocol', 'partner', 'security']);
const SUPPORTED_CANONICAL_CLAIM_TYPES = new Set([
  'identity.github_verified',
  'identity.domain_verified',
  'identity.agentmail_verified',
  'identity.wallet_control_verified',
  'identity.mcp_verified',
  'identity.a2a_verified',
  'capability.verified',
  'work.job_completed',
  'work.escrow_released',
  'review.received',
  'risk.flagged',
]);
const INTEROP_REASON_CODES = Object.freeze({
  INVALID_EVIDENCE: 'invalid_evidence',
  IDENTITY_UNKNOWN: 'identity_unknown',
  IDENTITY_CONTINUITY_MISMATCH: 'identity_continuity_mismatch',
  SESSION_CONFLICT: 'session_conflict',
  SUBJECT_BINDING_INVALID: 'subject_binding_invalid',
  PUBLICATION_UNAUTHORIZED: 'publication_unauthorized',
  FRESHNESS_INVALID: 'freshness_invalid',
});

function addError(errors, details, code, message) {
  details.add(code);
  errors.push(code + ': ' + message);
}

function addDetail(details, code) {
  details.add(code);
}

function isHex64(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function parseTimestamp(value) {
  if (!isNonEmptyString(value)) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertPublicKey(value, errors, details, code) {
  try {
    return new PublicKey(value).toBase58();
  } catch (err) {
    addError(errors, details, code, 'expected a Solana public key');
    return null;
  }
}

function checkNetwork(record, errors, details, expectedNetwork = DEFAULT_NETWORK) {
  if (record.network !== expectedNetwork) {
    addError(errors, details, 'network', 'expected ' + expectedNetwork);
  } else {
    addDetail(details, 'network');
  }
}

function checkHash(value, errors, details, code) {
  if (!isHex64(value)) {
    addError(errors, details, code, 'expected a 32-byte lowercase hex hash');
  } else {
    addDetail(details, code);
  }
}

function checkFreshness(record, errors, details, validationTime) {
  if (record.expiresAt !== undefined && record.expiresAt !== null && record.expiresAt <= validationTime) {
    addError(errors, details, 'stale', 'expiresAt is not fresh for validation time');
  }
  if (record.freshness && record.freshness.notAfter <= validationTime) {
    addError(errors, details, 'stale', 'freshness.notAfter is not fresh for validation time');
  }
  if (record.schemaCompatibility && record.schemaCompatibility.minReaderVersion !== 'rc-s6') {
    addError(errors, details, 'schemaCompatibility', 'record predates the RC-S6 reader compatibility window');
  }
  if (!details.has('stale') && !details.has('schemaCompatibility')) {
    addDetail(details, 'freshness');
  }
}

function checkSubjectIdentity(subject, errors, details) {
  if (!subject || typeof subject !== 'object') {
    addError(errors, details, 'subjectIdentity', 'subjectIdentity is required');
    return;
  }

  const expectedHash = hashAgentId(subject.agentId || '').toString('hex');
  if (subject.agentIdHash !== expectedHash) {
    addError(errors, details, 'subjectIdentity', 'agentIdHash does not match agentId');
  }

  let expectedGenesis = null;
  try {
    expectedGenesis = getGenesisPDA(subject.agentId, DEFAULT_NETWORK)[0].toBase58();
  } catch (err) {
    addError(errors, details, 'subjectIdentity', err.message);
  }

  if (expectedGenesis && subject.genesisPda !== expectedGenesis) {
    addError(errors, details, 'subjectIdentity', 'genesisPda does not match agentId');
  }

  if (subject.agentIdHash === expectedHash && subject.genesisPda === expectedGenesis) {
    addDetail(details, 'subjectIdentity');
    addDetail(details, 'agentIdHash');
    addDetail(details, 'identityPda');
  }
}

function checkNoMutationIndicators(value, errors, details, location = 'record') {
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    const childLocation = location + '.' + key;

    if ((normalizedKey === 'signers' || normalizedKey === 'instructions') && Array.isArray(child) && child.length > 0) {
      addError(errors, details, 'noMutationIndicators', childLocation + ' must be empty');
    }
    if (normalizedKey === 'transaction' && child !== null && child !== undefined) {
      addError(errors, details, 'noMutationIndicators', childLocation + ' must be null');
    }
    if (['rpcurl', 'rpcwrite', 'deploy', 'publish', 'keypair', 'secretkey'].includes(normalizedKey) && child) {
      addError(errors, details, 'noMutationIndicators', childLocation + ' must not be present/truthy');
    }
    if (normalizedKey === 'livepaymentrequired' && child !== false) {
      addError(errors, details, 'noMutationIndicators', childLocation + ' must be false');
    }
    if (child && typeof child === 'object') {
      checkNoMutationIndicators(child, errors, details, childLocation);
    }
  }
}

function result(errors, details, extra = {}) {
  return {
    ok: errors.length === 0,
    details: [...details].sort(),
    errors,
    ...extra,
  };
}

function verifySatpIdentity(record, { validationTime = DEFAULT_VALIDATION_TIME } = {}) {
  const errors = [];
  const details = new Set();

  if (!record || typeof record !== 'object') {
    addError(errors, details, 'identity', 'identity record must be an object');
    return result(errors, details);
  }
  if (record.schemaVersion !== 'satp.identity.v1') {
    addError(errors, details, 'schemaVersion', 'expected satp.identity.v1');
  } else {
    addDetail(details, 'schemaVersion');
  }
  if (record.recordType !== 'identity') {
    addError(errors, details, 'recordType', 'expected identity');
  }

  checkNetwork(record, errors, details);
  assertPublicKey(record.authority, errors, details, 'authority');
  assertPublicKey(record.primaryWallet, errors, details, 'primaryWallet');
  checkHash(record.metadataHash, errors, details, 'metadataHash');

  const expectedHash = hashAgentId(record.agentId || '').toString('hex');
  if (record.agentIdHash !== expectedHash) {
    addError(errors, details, 'agentIdHash', 'agentIdHash does not match agentId');
  } else {
    addDetail(details, 'agentIdHash');
  }

  try {
    const [genesisPda, genesisBump] = getGenesisPDA(record.agentId || '', record.network || DEFAULT_NETWORK);
    if (
      !record.pda ||
      record.pda.genesis !== genesisPda.toBase58() ||
      record.pda.genesisBump !== genesisBump ||
      record.identityId !== genesisPda.toBase58()
    ) {
      addError(errors, details, 'identityPda', 'Genesis PDA does not match agentId/network');
    } else {
      addDetail(details, 'identityPda');
    }
  } catch (err) {
    addError(errors, details, 'identityPda', err.message);
  }

  if (record.status !== 'active') {
    addError(errors, details, 'status', 'identity must be active');
  }
  checkFreshness(record, errors, details, validationTime);
  addDetail(details, 'readOnly');

  return result(errors, details);
}

function verifySatpAttestation(record, { validationTime = DEFAULT_VALIDATION_TIME } = {}) {
  const errors = [];
  const details = new Set();

  if (!record || typeof record !== 'object') {
    addError(errors, details, 'attestation', 'attestation record must be an object');
    return result(errors, details);
  }
  if (record.schemaVersion !== 'satp.attestation.v1') {
    addError(errors, details, 'schemaVersion', 'expected satp.attestation.v1');
  } else {
    addDetail(details, 'schemaVersion');
  }
  if (record.recordType !== 'attestation') {
    addError(errors, details, 'recordType', 'expected attestation');
  }

  checkNetwork(record, errors, details);
  checkSubjectIdentity(record.subjectIdentity, errors, details);
  assertPublicKey(record.subjectWallet, errors, details, 'subjectWallet');
  assertPublicKey(record.issuer, errors, details, 'issuer');
  checkHash(record.evidenceHash, errors, details, 'evidenceHash');
  checkHash(record.metadataHash, errors, details, 'metadataHash');

  if (!SUPPORTED_ISSUER_TRUST_CLASSES.has(record.issuerTrustClass)) {
    addError(errors, details, 'issuerTrustClass', 'unsupported issuer trust class: ' + record.issuerTrustClass);
  } else {
    addDetail(details, 'issuerTrustClass');
  }
  if (!SUPPORTED_CANONICAL_CLAIM_TYPES.has(record.canonicalClaimType)) {
    addError(errors, details, 'claimType', 'unsupported canonical claim type');
  } else {
    addDetail(details, 'claimType');
  }
  if (record.status === 'revoked' || record.revokedAt !== null) {
    addError(errors, details, 'revoked', 'revoked attestation must fail closed');
  }
  if (record.status !== 'active') {
    addError(errors, details, 'status', 'attestation must be active');
  }

  if (record.subjectIdentity && record.issuer && record.claimType && record.pda) {
    try {
      const [attestationPda, attestationBump] = getV3AttestationPDA(
        record.subjectIdentity.agentId,
        record.issuer,
        record.claimType,
        record.network || DEFAULT_NETWORK
      );
      if (
        record.pda.attestation !== attestationPda.toBase58() ||
        record.pda.attestationBump !== attestationBump ||
        record.attestationId !== attestationPda.toBase58()
      ) {
        addError(errors, details, 'attestationPda', 'attestation PDA does not match subject/issuer/claim');
      } else {
        addDetail(details, 'attestationPda');
      }
    } catch (err) {
      addError(errors, details, 'attestationPda', err.message);
    }
  }

  checkFreshness(record, errors, details, validationTime);
  return result(errors, details);
}

function verifySatpTrustPacket(packet, { validationTime = DEFAULT_VALIDATION_TIME } = {}) {
  const errors = [];
  const details = new Set();

  const sdkResult = validateSatpTrustPacket(packet);
  if (!sdkResult.ok) {
    addError(errors, details, 'trustPacket', sdkResult.errors.join('; '));
  } else {
    addDetail(details, 'trustPacket');
  }

  if (!packet || typeof packet !== 'object') {
    return result(errors, details);
  }

  if (packet.expiresAt !== undefined && packet.expiresAt !== null && packet.expiresAt <= validationTime) {
    addError(errors, details, 'stale', 'trust packet expiresAt is not fresh for validation time');
  } else {
    addDetail(details, 'freshness');
  }

  const expected = {
    signingRequired: false,
    transactionRequired: false,
    writesRequired: false,
    livePaymentRequired: false,
    unsigned: true,
    noSign: true,
    noTransaction: true,
  };
  if (!sameJsonValue(packet.flags, expected)) {
    addError(errors, details, 'readOnlyFlags', 'packet flags are not read-only');
  } else {
    addDetail(details, 'readOnlyFlags');
  }

  checkNoMutationIndicators(packet, errors, details);
  if (!details.has('noMutationIndicators')) {
    addDetail(details, 'noMutationIndicators');
  }
  addDetail(details, 'noNetwork');

  return result(errors, details);
}

function verifyInteropSessionIdentity(record, options = {}) {
  const errors = [];
  const details = new Set();
  const checks = {
    structurallyValid: false,
    identityContinuityValid: false,
    sessionBindingValid: false,
    receiptBindingValid: false,
    noSessionConflict: false,
  };

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    addError(errors, details, INTEROP_REASON_CODES.INVALID_EVIDENCE, 'session identity record must be an object');
    return result(errors, details, { checks });
  }

  const subject = record.subject || {};
  const provider = record.provider || {};
  const session = record.session || {};
  const persistedLink = record.persistedLink || {};
  const outcomeReceipt = record.outcomeReceipt || {};
  const transport = record.transport || {};
  const requiredStrings = [
    ['subject.agentId', subject.agentId],
    ['subject.controllerId', subject.controllerId],
    ['session.sessionId', session.sessionId],
    ['persistedLink.agentId', persistedLink.agentId],
    ['persistedLink.sessionId', persistedLink.sessionId],
    ['outcomeReceipt.agentId', outcomeReceipt.agentId],
    ['outcomeReceipt.sessionId', outcomeReceipt.sessionId],
    ['transport.connectionId', transport.connectionId],
  ];

  if (record.schemaVersion !== 'satp.interopSessionIdentity.v0') {
    addError(errors, details, INTEROP_REASON_CODES.INVALID_EVIDENCE, 'expected satp.interopSessionIdentity.v0');
  }
  for (const [field, value] of requiredStrings) {
    if (!isNonEmptyString(value)) {
      addError(errors, details, INTEROP_REASON_CODES.INVALID_EVIDENCE, field + ' must be a non-empty string');
    }
  }
  if (!isHex64(transport.reconnectTokenDigest)) {
    addError(errors, details, INTEROP_REASON_CODES.INVALID_EVIDENCE, 'transport.reconnectTokenDigest must be a SHA-256 hex digest');
  }
  if (!Array.isArray(record.activePeers)) {
    addError(errors, details, INTEROP_REASON_CODES.INVALID_EVIDENCE, 'activePeers must be an array');
  }
  if (errors.length > 0) return result(errors, details, { checks });
  checks.structurallyValid = true;

  checks.identityContinuityValid = provider.agentId === subject.agentId
    && (options.expectedAgentId === undefined || options.expectedAgentId === subject.agentId);
  if (!checks.identityContinuityValid) {
    addError(
      errors,
      details,
      provider.agentId ? INTEROP_REASON_CODES.IDENTITY_CONTINUITY_MISMATCH : INTEROP_REASON_CODES.IDENTITY_UNKNOWN,
      'provider-authoritative identity does not match the expected stable subject'
    );
  }

  checks.sessionBindingValid = persistedLink.agentId === subject.agentId
    && persistedLink.sessionId === session.sessionId
    && (options.expectedSessionId === undefined || options.expectedSessionId === session.sessionId);
  if (!checks.sessionBindingValid) {
    addError(errors, details, INTEROP_REASON_CODES.IDENTITY_CONTINUITY_MISMATCH, 'persisted link is not bound to the agent/session pair');
  }

  checks.receiptBindingValid = outcomeReceipt.agentId === subject.agentId
    && outcomeReceipt.sessionId === session.sessionId;
  if (!checks.receiptBindingValid) {
    addError(errors, details, INTEROP_REASON_CODES.IDENTITY_CONTINUITY_MISMATCH, 'outcome receipt is not bound to the exact agent/session pair');
  }

  checks.noSessionConflict = !record.activePeers.some((peer) => {
    if (!peer || typeof peer !== 'object') return true;
    const sameSessionDifferentConnection = peer.sessionId === session.sessionId
      && peer.transportConnectionId !== transport.connectionId;
    const sameConnectionDifferentSession = peer.transportConnectionId === transport.connectionId
      && peer.sessionId !== session.sessionId;
    return sameSessionDifferentConnection || sameConnectionDifferentSession;
  });
  if (!checks.noSessionConflict) {
    addError(errors, details, INTEROP_REASON_CODES.SESSION_CONFLICT, 'session or transport identity collides with an active peer');
  }

  if (checks.identityContinuityValid) addDetail(details, 'identityContinuityValid');
  if (checks.sessionBindingValid) addDetail(details, 'sessionBindingValid');
  if (checks.receiptBindingValid) addDetail(details, 'receiptBindingValid');
  if (checks.noSessionConflict) addDetail(details, 'noSessionConflict');
  return result(errors, details, { checks });
}

function verifyPublishedIdentityArtifact(record, { now = new Date() } = {}) {
  const errors = [];
  const details = new Set();
  const checks = {
    structurallyValid: false,
    subjectBindingValid: false,
    publicationAuthorized: false,
    freshnessValid: false,
  };

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    addError(errors, details, INTEROP_REASON_CODES.INVALID_EVIDENCE, 'published identity artifact must be an object');
    return result(errors, details, { checks });
  }

  const subject = record.subject || {};
  const artifact = record.artifact || {};
  const subjectBinding = artifact.subjectBinding || {};
  const publication = record.publication || {};
  const authorization = publication.authorization || {};
  const timestamps = record.timestamps || {};
  const profile = artifact.profile || {};
  const requiredStrings = [
    ['subject.agentId', subject.agentId],
    ['subject.controllerId', subject.controllerId],
    ['artifact.profile.id', profile.id],
    ['artifact.profile.version', profile.version],
    ['artifact.generatorId', artifact.generatorId],
    ['subjectBinding.subjectId', subjectBinding.subjectId],
    ['subjectBinding.controllerId', subjectBinding.controllerId],
    ['publication.origin', publication.origin],
    ['publication.publisherId', publication.publisherId],
    ['authorization.controllerId', authorization.controllerId],
    ['authorization.publisherId', authorization.publisherId],
    ['authorization.profileVersion', authorization.profileVersion],
  ];
  const parsedTimes = {
    generatedAt: parseTimestamp(timestamps.generatedAt),
    publishedAt: parseTimestamp(timestamps.publishedAt),
    observedAt: parseTimestamp(timestamps.observedAt),
    validUntil: parseTimestamp(timestamps.validUntil),
    authorizationExpiresAt: parseTimestamp(authorization.expiresAt),
    now: parseTimestamp(now instanceof Date ? now.toISOString() : now),
  };

  if (record.schemaVersion !== 'satp.publishedIdentityArtifact.v0') {
    addError(errors, details, INTEROP_REASON_CODES.INVALID_EVIDENCE, 'expected satp.publishedIdentityArtifact.v0');
  }
  for (const [field, value] of requiredStrings) {
    if (!isNonEmptyString(value)) {
      addError(errors, details, INTEROP_REASON_CODES.INVALID_EVIDENCE, field + ' must be a non-empty string');
    }
  }
  for (const [field, value] of [
    ['artifact.digest', artifact.digest],
    ['subjectBinding.artifactDigest', subjectBinding.artifactDigest],
    ['publication.observedArtifactDigest', publication.observedArtifactDigest],
    ['authorization.artifactDigest', authorization.artifactDigest],
  ]) {
    if (!isHex64(value)) {
      addError(errors, details, INTEROP_REASON_CODES.INVALID_EVIDENCE, field + ' must be a SHA-256 hex digest');
    }
  }
  for (const [field, value] of Object.entries(parsedTimes)) {
    if (!value) addError(errors, details, INTEROP_REASON_CODES.INVALID_EVIDENCE, field + ' must be a valid timestamp');
  }
  if (record.revokedAt !== null || record.supersededBy !== null) {
    addError(errors, details, INTEROP_REASON_CODES.FRESHNESS_INVALID, 'revoked or superseded artifacts are not current');
  }
  if (errors.some((error) => error.startsWith(INTEROP_REASON_CODES.INVALID_EVIDENCE + ':'))) {
    return result(errors, details, { checks });
  }
  checks.structurallyValid = true;

  checks.subjectBindingValid = subjectBinding.subjectId === subject.agentId
    && subjectBinding.controllerId === subject.controllerId
    && subjectBinding.artifactDigest === artifact.digest;
  if (!checks.subjectBindingValid) {
    addError(errors, details, INTEROP_REASON_CODES.SUBJECT_BINDING_INVALID, 'controller proof is not bound to the subject and artifact digest');
  }

  checks.publicationAuthorized = authorization.controllerId === subject.controllerId
    && authorization.publisherId === publication.publisherId
    && authorization.artifactDigest === artifact.digest
    && authorization.profileVersion === profile.version
    && publication.observedArtifactDigest === artifact.digest
    && parsedTimes.authorizationExpiresAt > parsedTimes.now;
  if (!checks.publicationAuthorized) {
    addError(errors, details, INTEROP_REASON_CODES.PUBLICATION_UNAUTHORIZED, 'publisher delegation is missing, expired, or bound to different content');
  }

  checks.freshnessValid = parsedTimes.generatedAt <= parsedTimes.publishedAt
    && parsedTimes.publishedAt <= parsedTimes.observedAt
    && parsedTimes.observedAt <= parsedTimes.now
    && parsedTimes.now < parsedTimes.validUntil
    && record.revokedAt === null
    && record.supersededBy === null;
  if (!checks.freshnessValid && !errors.some((error) => error.startsWith(INTEROP_REASON_CODES.FRESHNESS_INVALID + ':'))) {
    addError(errors, details, INTEROP_REASON_CODES.FRESHNESS_INVALID, 'artifact observation is stale or its lifecycle timestamps are inconsistent');
  }

  if (checks.subjectBindingValid) addDetail(details, 'subjectBindingValid');
  if (checks.publicationAuthorized) addDetail(details, 'publicationAuthorized');
  if (checks.freshnessValid) addDetail(details, 'freshnessValid');
  return result(errors, details, { checks });
}

function verifyBundle({ identity, attestation, trustPacket } = {}, opts = {}) {
  const identityResult = verifySatpIdentity(identity, opts);
  const attestationResult = verifySatpAttestation(attestation, opts);
  const trustPacketResult = verifySatpTrustPacket(trustPacket, opts);
  const errors = [
    ...identityResult.errors.map((err) => 'identity.' + err),
    ...attestationResult.errors.map((err) => 'attestation.' + err),
    ...trustPacketResult.errors.map((err) => 'trustPacket.' + err),
  ];

  if (identity && attestation) {
    if (identity.agentId !== attestation.subjectIdentity?.agentId) {
      errors.push('bundle.agentId: identity and attestation subjects differ');
    }
    if (identity.primaryWallet !== attestation.subjectWallet) {
      errors.push('bundle.subjectWallet: identity and attestation wallets differ');
    }
  }
  if (identity && trustPacket) {
    if (identity.agentId !== trustPacket.agentId) {
      errors.push('bundle.agentId: identity and trust packet subjects differ');
    }
    if (identity.primaryWallet !== trustPacket.subjectWallet) {
      errors.push('bundle.subjectWallet: identity and trust packet wallets differ');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    identity: identityResult,
    attestation: attestationResult,
    trustPacket: trustPacketResult,
    boundary: {
      runtime: 'third-party-runtime-conformance',
      agentFolioRuntimeRequired: false,
      agentFolioApiRequired: false,
      agentFolioDatabaseRequired: false,
      networkAccessRequired: false,
      signingRequired: false,
      transactionRequired: false,
      writesRequired: false,
    },
  };
}

function loadFixture(name, { fixturesDir = FIXTURE_DIR } = {}) {
  if (!/^[a-z0-9-]+\.json$/.test(name)) {
    throw new Error('Invalid fixture name');
  }
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));
}

function createThirdPartySatpRuntime(opts = {}) {
  return {
    loadFixture(name) {
      return loadFixture(name, opts);
    },
    buildTrustPacket: buildSatpTrustPacket,
    verifyIdentity: verifySatpIdentity,
    verifyAttestation: verifySatpAttestation,
    verifyTrustPacket: verifySatpTrustPacket,
    verifyInteropSessionIdentity,
    verifyPublishedIdentityArtifact,
    verifyBundle,
    boundary: {
      runtime: 'third-party-runtime-conformance',
      dependency: '@brainai/satp-client',
      agentFolioRuntimeRequired: false,
      fixtureFirst: true,
      offlineByDefault: true,
    },
  };
}

module.exports = {
  createThirdPartySatpRuntime,
  loadFixture,
  verifySatpIdentity,
  verifySatpAttestation,
  verifySatpTrustPacket,
  verifyInteropSessionIdentity,
  verifyPublishedIdentityArtifact,
  INTEROP_REASON_CODES,
  verifyBundle,
};

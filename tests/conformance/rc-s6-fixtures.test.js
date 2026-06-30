#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const dns = require('node:dns');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const tls = require('node:tls');
const { PublicKey } = require('@solana/web3.js');
const {
  buildSatpTrustPacket,
  getGenesisPDA,
  getLinkedWalletPDA,
  getV3AttestationPDA,
  getV3EscrowPDA,
  getV3ReviewPDA,
  hashAgentId,
  validateSatpTrustPacket,
} = require('../../packages/satp-client/src');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const VALIDATION_TIME = 1767139200;
const FIXTURE_VERSION = 'satp.rc-s6.fixture.v1';

let networkAttempted = false;
function blockNetwork(apiName) {
  return function blockedNetworkCall() {
    networkAttempted = true;
    throw new Error('RC-S6 conformance suite must remain offline; blocked ' + apiName);
  };
}

http.request = blockNetwork('http.request');
http.get = blockNetwork('http.get');
https.request = blockNetwork('https.request');
https.get = blockNetwork('https.get');
net.connect = blockNetwork('net.connect');
net.createConnection = blockNetwork('net.createConnection');
tls.connect = blockNetwork('tls.connect');
dns.lookup = blockNetwork('dns.lookup');
dns.resolve = blockNetwork('dns.resolve');

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

const EXPECTED_FILES = [
  'identity-positive.json',
  'linked-account-positive.json',
  'attestation-positive.json',
  'trust-packet-positive.json',
  'identity-stale.json',
  'attestation-revoked.json',
  'attestation-malformed.json',
  'issuer-unsupported.json',
  'score-meaning-boundary.json',
  'review-weight-boundary.json',
  'escrow-reference-boundary.json',
  'agentfolio-consumer-copy-boundary.json',
];

const COPY_SURFACE_ROOT = path.join(__dirname, '..', '..');
const COPY_BANNED_PATTERNS = [
  /\bSATP\s+is\s+(?:mainnet|production|launch)[-\s]?ready\b/i,
  /\bmainnet[-\s]?ready\s+SATP\b/i,
  /\bescrow[-\s]?ready\s+SATP\b/i,
  /\bSATP\s+escrow\s+is\s+(?:ready|live|active|enabled)\b/i,
  /\bvalue[-\s]?bearing\s+(?:escrow|payments?)\s+(?:is|are)\s+(?:ready|live|active|enabled)\b/i,
  /\breplace\s+AgentFolio(?:'s)?\s+production\s+dependency\b/i,
  /\bpromote\s+@brainai\/satp-client\s+to\s+npm\s+latest\b/i,
  /\bready\s+for\s+public\s+launch\b/i,
  /\blive\s+(?:escrow|payment)\s+(?:is|are)\s+(?:ready|active|enabled)\b/i,
];

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

function assertPublicKey(value, errors, details, code) {
  try {
    return new PublicKey(value).toBase58();
  } catch (err) {
    addError(errors, details, code, 'expected a Solana public key');
    return null;
  }
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function checkSchema(record, expected, errors, details) {
  if (record.schemaVersion !== expected) {
    addError(errors, details, 'schemaVersion', 'expected ' + expected);
  } else {
    addDetail(details, 'schemaVersion');
  }
}

function checkNetwork(record, errors, details) {
  if (record.network !== 'devnet') {
    addError(errors, details, 'network', 'RC-S6 fixtures are devnet/offline only');
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
    expectedGenesis = getGenesisPDA(subject.agentId, 'devnet')[0].toBase58();
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

function checkIssuerTrustClass(record, errors, details) {
  if (!SUPPORTED_ISSUER_TRUST_CLASSES.has(record.issuerTrustClass)) {
    addError(errors, details, 'issuerTrustClass', 'unsupported issuer trust class: ' + record.issuerTrustClass);
  } else {
    addDetail(details, 'issuerTrustClass');
  }
}

function checkFreshness(record, errors, details) {
  if (record.expiresAt !== undefined && record.expiresAt !== null && record.expiresAt <= VALIDATION_TIME) {
    addError(errors, details, 'stale', 'expiresAt is not fresh for RC-S6 validation time');
  }
  if (record.freshness && record.freshness.notAfter <= VALIDATION_TIME) {
    addError(errors, details, 'stale', 'freshness.notAfter is not fresh for RC-S6 validation time');
  }
  if (record.schemaCompatibility && record.schemaCompatibility.minReaderVersion !== 'rc-s6') {
    addError(errors, details, 'schemaCompatibility', 'fixture predates the RC-S6 reader compatibility window');
  }
  if (!details.has('stale') && !details.has('schemaCompatibility')) {
    addDetail(details, 'freshness');
  }
}

function checkUncertainty(record, expectedSurface, expectedBehavior, expectedMustNot, errors, details) {
  const uncertainty = record.uncertainty;
  const detailCode = expectedSurface + 'Uncertainty';
  if (!uncertainty || typeof uncertainty !== 'object') {
    addError(errors, details, detailCode, 'uncertainty note is required');
    return;
  }
  if (uncertainty.surface !== expectedSurface) {
    addError(errors, details, detailCode, 'unexpected uncertainty surface');
  }
  if (uncertainty.status !== 'rc-s6-boundary') {
    addError(errors, details, detailCode, 'uncertainty status must be rc-s6-boundary');
  }
  if (uncertainty.consumerBehavior !== expectedBehavior) {
    addError(errors, details, detailCode, 'unexpected consumer behavior');
  }
  if (typeof uncertainty.meaning !== 'string' || uncertainty.meaning.length < 24) {
    addError(errors, details, detailCode, 'uncertainty meaning must be explicit');
  }
  if (!Array.isArray(uncertainty.mustNot)) {
    addError(errors, details, detailCode, 'uncertainty mustNot list is required');
  } else {
    for (const expected of expectedMustNot) {
      if (!uncertainty.mustNot.includes(expected)) {
        addError(errors, details, detailCode, 'missing mustNot guard: ' + expected);
      }
    }
  }
  if (!errors.some((error) => error.startsWith(detailCode + ':'))) {
    addDetail(details, detailCode);
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

function validateIdentity(record, errors, details) {
  checkSchema(record, 'satp.identity.v1', errors, details);
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
  const [genesisPda, genesisBump] = getGenesisPDA(record.agentId || '', 'devnet');
  if (!record.pda || record.pda.genesis !== genesisPda.toBase58() || record.pda.genesisBump !== genesisBump || record.identityId !== genesisPda.toBase58()) {
    addError(errors, details, 'identityPda', 'Genesis PDA does not match agentId/network');
  } else {
    addDetail(details, 'identityPda');
  }
  if (record.status !== 'active') {
    addError(errors, details, 'status', 'identity must be active');
  }
  checkFreshness(record, errors, details);
  if (record.uncertainty && record.uncertainty.surface === 'staleRevokedEvidence') {
    checkUncertainty(record, 'staleRevokedEvidence', 'fail-closed', ['aggregate-trust', 'verified-badge'], errors, details);
  }
  addDetail(details, 'readOnly');
}

function validateLinkedAccount(record, errors, details) {
  checkSchema(record, 'satp.linkedAccount.v1', errors, details);
  checkNetwork(record, errors, details);
  checkSubjectIdentity(record.subjectIdentity, errors, details);
  assertPublicKey(record.accountRef, errors, details, 'accountRef');
  assertPublicKey(record.issuer, errors, details, 'issuer');
  checkIssuerTrustClass(record, errors, details);
  checkHash(record.proofHash, errors, details, 'proofHash');
  if (record.accountKind !== 'solana_wallet') {
    addError(errors, details, 'accountKind', 'expected solana_wallet');
  }
  if (record.enabled !== true) {
    addError(errors, details, 'enabled', 'linked account must be enabled');
  }
  if (record.subjectIdentity && record.accountRef && record.pda) {
    try {
      const [linkedWalletPda, linkedWalletBump] = getLinkedWalletPDA(record.subjectIdentity.genesisPda, record.accountRef, record.network);
      if (record.pda.linkedWallet !== linkedWalletPda.toBase58() || record.pda.linkedWalletBump !== linkedWalletBump) {
        addError(errors, details, 'linkedWalletPda', 'linked wallet PDA does not match subject identity and wallet');
      } else {
        addDetail(details, 'linkedWalletPda');
      }
    } catch (err) {
      addError(errors, details, 'linkedWalletPda', err.message);
    }
  }
  checkFreshness(record, errors, details);
}

function validateAttestation(record, errors, details) {
  checkSchema(record, 'satp.attestation.v1', errors, details);
  checkNetwork(record, errors, details);
  checkSubjectIdentity(record.subjectIdentity, errors, details);
  assertPublicKey(record.subjectWallet, errors, details, 'subjectWallet');
  assertPublicKey(record.issuer, errors, details, 'issuer');
  checkIssuerTrustClass(record, errors, details);
  checkHash(record.evidenceHash, errors, details, 'evidenceHash');
  checkHash(record.metadataHash, errors, details, 'metadataHash');
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
        record.network
      );
      if (record.pda.attestation !== attestationPda.toBase58() || record.pda.attestationBump !== attestationBump || record.attestationId !== attestationPda.toBase58()) {
        addError(errors, details, 'attestationPda', 'attestation PDA does not match subject/issuer/claim');
      } else {
        addDetail(details, 'attestationPda');
      }
    } catch (err) {
      addError(errors, details, 'attestationPda', err.message);
    }
  }
  if (record.issuerAuthority) {
    if (record.issuerAuthority.trustClass !== record.issuerTrustClass || record.issuerAuthority.authorityResolved !== false) {
      addError(errors, details, 'issuerTrustClassAuthority', 'issuer authority note must preserve RC-S6 fixture-only authority');
    } else {
      addDetail(details, 'issuerTrustClassAuthority');
    }
  }
  if (record.uncertainty && record.uncertainty.surface === 'issuerTrustClassAuthority') {
    checkUncertainty(record, 'issuerTrustClassAuthority', 'fixture-only', ['authority-promotion', 'mainnet-authority-inference'], errors, details);
  }
  if (record.uncertainty && record.uncertainty.surface === 'staleRevokedEvidence') {
    checkUncertainty(record, 'staleRevokedEvidence', 'fail-closed', ['aggregate-trust', 'verified-badge'], errors, details);
  }
  if (record.uncertainty && record.uncertainty.surface === 'unsupportedIssuerBehavior') {
    checkUncertainty(record, 'unsupportedIssuerBehavior', 'fail-closed', ['verified-badge', 'trust-promotion'], errors, details);
  }
  checkFreshness(record, errors, details);
}

function validateTrustPacket(record, errors, details) {
  checkSchema(record, 'satp.trustPacketFixture.v1', errors, details);
  const result = validateSatpTrustPacket(record.packet);
  if (!result.ok) {
    addError(errors, details, 'trustPacket', result.errors.join('; '));
  } else {
    addDetail(details, 'trustPacket');
  }
  const expected = buildSatpTrustPacket({
    subjectWallet: record.packet && record.packet.subjectWallet,
    agentId: record.packet && record.packet.agentId,
    claimType: record.packet && record.packet.claimType,
    metadataHash: record.packet && record.packet.metadataHash,
    attester: record.packet && record.packet.attester,
    network: record.packet && record.packet.network,
    expiresAt: record.packet && record.packet.expiresAt,
  });
  if (!sameJsonValue(record.packet, expected)) {
    addError(errors, details, 'trustPacket', 'packet does not match deterministic SDK output');
  }
  if (record.packet && record.packet.flags && record.packet.flags.signingRequired === false && record.packet.flags.transactionRequired === false && record.packet.flags.writesRequired === false && record.packet.flags.livePaymentRequired === false) {
    addDetail(details, 'readOnlyFlags');
  } else {
    addError(errors, details, 'readOnlyFlags', 'packet flags are not read-only');
  }
  checkNoMutationIndicators(record.packet, errors, details);
  if (!details.has('noMutationIndicators')) {
    addDetail(details, 'noMutationIndicators');
  }
  addDetail(details, 'noNetwork');
}

function validateReviewBoundary(record, errors, details) {
  checkSchema(record, 'satp.reviewWeightInput.v1', errors, details);
  checkNetwork(record, errors, details);
  checkSubjectIdentity(record.subjectIdentity, errors, details);
  assertPublicKey(record.reviewer, errors, details, 'reviewer');
  checkHash(record.descriptionHash, errors, details, 'descriptionHash');
  try {
    const [reviewPda, reviewBump] = getV3ReviewPDA(record.subjectIdentity.agentId, record.reviewer, record.network);
    if (record.reviewPda !== reviewPda.toBase58() || record.reviewBump !== reviewBump) {
      addError(errors, details, 'reviewPda', 'review PDA does not match subject/reviewer');
    }
  } catch (err) {
    addError(errors, details, 'reviewPda', err.message);
  }
  if (record.uncertaintyStatus !== 'rc-s6-boundary') {
    addError(errors, details, 'reviewWeightBoundaryExplicit', 'review boundary uncertainty must be explicit');
  } else {
    addDetail(details, 'reviewWeightBoundaryExplicit');
  }
  checkUncertainty(record, 'reviewWeight', 'warning-only', ['validation-promotion', 'ranking-boost'], errors, details);
  if (record.proposedValidationLevel > 2 && record.inputRefs.length < 2) {
    addDetail(details, 'noValidationPromotion');
    return 'warning';
  }
  return 'pass';
}

function validateScoreBoundary(record, errors, details) {
  checkSchema(record, 'satp.scoreMeaningInput.v1', errors, details);
  checkNetwork(record, errors, details);
  checkSubjectIdentity(record.subjectIdentity, errors, details);
  if (!Number.isInteger(record.score) || record.score < 0 || record.score > 100) {
    addError(errors, details, 'scoreMeaningBoundaryExplicit', 'score must be an integer in the fixture display range');
  }
  if (record.formulaVersion !== 'rc-s6-boundary' || record.releaseApproved !== false || record.trustPromotionAllowed !== false) {
    addError(errors, details, 'scoreMeaningBoundaryExplicit', 'score fixture must be explicit boundary-only evidence');
  } else {
    addDetail(details, 'scoreMeaningBoundaryExplicit');
  }
  checkUncertainty(record, 'scoreMeaning', 'warning-only', ['trust-score-promotion', 'eligibility-unlock'], errors, details);
  addDetail(details, 'noScorePromotion');
  return 'warning';
}

function validateEscrowBoundary(record, errors, details) {
  checkSchema(record, 'satp.escrowReference.v1', errors, details);
  checkNetwork(record, errors, details);
  checkSubjectIdentity(record.subjectIdentity, errors, details);
  assertPublicKey(record.payer, errors, details, 'payer');
  checkHash(record.descriptionHash, errors, details, 'descriptionHash');
  try {
    const [escrowPda, escrowBump] = getV3EscrowPDA(record.payer, Buffer.from(record.descriptionHash, 'hex'), record.nonce, record.network);
    if (record.escrowPda !== escrowPda.toBase58() || record.escrowBump !== escrowBump) {
      addError(errors, details, 'escrowPda', 'escrow PDA does not match payer/description/nonce');
    }
  } catch (err) {
    addError(errors, details, 'escrowPda', err.message);
  }
  if (record.uncertaintyStatus !== 'rc-s6-boundary' || record.state !== 'reference_only' || record.valueBearingReady !== false) {
    addError(errors, details, 'escrowReferenceBoundaryExplicit', 'escrow fixture must be explicit reference-only uncertainty');
  } else {
    addDetail(details, 'escrowReferenceBoundaryExplicit');
  }
  checkUncertainty(record, 'escrowReferenceMeaning', 'warning-only', ['funds-locked-copy', 'live-payment-copy'], errors, details);
  if (record.amount !== null || record.mint !== null || ['funded', 'released'].includes(record.state)) {
    addError(errors, details, 'noEscrowActivation', 'escrow reference must not imply value-bearing activation');
  } else {
    addDetail(details, 'noEscrowActivation');
    return 'warning';
  }
  return 'fail';
}

function validateAgentFolioCopyBoundary(record, errors, details) {
  checkSchema(record, 'satp.agentfolioConsumerCopyBoundary.v1', errors, details);
  checkUncertainty(record, 'agentfolioConsumerCopyBoundary', 'copy-boundary', ['mainnet-ready-copy', 'escrow-ready-copy', 'npm-latest-promotion'], errors, details);
  if (!Array.isArray(record.copySurfaces) || record.copySurfaces.length === 0) {
    addError(errors, details, 'agentfolioConsumerCopyBoundary', 'copy surfaces are required');
    return 'fail';
  }
  for (const surface of record.copySurfaces) {
    if (typeof surface !== 'string' || surface.includes('..') || path.isAbsolute(surface)) {
      addError(errors, details, 'agentfolioConsumerCopyBoundary', 'copy surface must be a repo-relative path');
      continue;
    }
    const text = fs.readFileSync(path.join(COPY_SURFACE_ROOT, surface), 'utf8');
    for (const required of record.requiredReadback || []) {
      if (!text.toLowerCase().includes(required.toLowerCase())) {
        addError(errors, details, 'agentfolioConsumerCopyBoundary', surface + ' missing required readback: ' + required);
      }
    }
    for (const pattern of COPY_BANNED_PATTERNS) {
      if (pattern.test(text)) {
        addError(errors, details, 'agentfolioConsumerCopyBoundary', surface + ' contains banned readiness claim: ' + pattern);
      }
    }
  }
  if (!errors.some((error) => error.startsWith('agentfolioConsumerCopyBoundary:'))) {
    addDetail(details, 'agentfolioConsumerCopyBoundary');
    return 'warning';
  }
  return 'fail';
}

function validateFixture(fixture) {
  const errors = [];
  const details = new Set();

  if (fixture.fixtureVersion !== FIXTURE_VERSION) {
    addError(errors, details, 'fixtureVersion', 'unexpected fixture version');
  }

  const record = fixture.record;
  let boundaryVerdict = null;

  if (!record || typeof record !== 'object') {
    addError(errors, details, 'record', 'fixture record is required');
  } else if (record.recordType === 'identity') {
    validateIdentity(record, errors, details);
  } else if (record.recordType === 'linked-account') {
    validateLinkedAccount(record, errors, details);
  } else if (record.recordType === 'attestation') {
    validateAttestation(record, errors, details);
  } else if (record.recordType === 'trust-packet') {
    validateTrustPacket(record, errors, details);
  } else if (record.recordType === 'score-meaning-boundary') {
    boundaryVerdict = validateScoreBoundary(record, errors, details);
  } else if (record.recordType === 'review-weight-boundary') {
    boundaryVerdict = validateReviewBoundary(record, errors, details);
  } else if (record.recordType === 'escrow-reference-boundary') {
    boundaryVerdict = validateEscrowBoundary(record, errors, details);
  } else if (record.recordType === 'agentfolio-consumer-copy-boundary') {
    boundaryVerdict = validateAgentFolioCopyBoundary(record, errors, details);
  } else {
    addError(errors, details, 'recordType', 'unsupported recordType');
  }

  const verdict = errors.length > 0 ? 'fail' : boundaryVerdict || 'pass';
  return {
    verdict,
    details: [...details].sort(),
    errors,
  };
}

const discovered = fs.readdirSync(FIXTURE_DIR).filter((file) => file.endsWith('.json')).sort();
assert.deepEqual(discovered, [...EXPECTED_FILES].sort(), 'RC-S6 fixture set must match the reviewed fixture manifest');

for (const file of EXPECTED_FILES) {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
  const result = validateFixture(fixture);
  assert.equal(result.verdict, fixture.expected.verdict, file + ' verdict mismatch: ' + result.errors.join('\n'));
  for (const expectedDetail of fixture.expected.details) {
    assert.ok(
      result.details.includes(expectedDetail),
      file + ' missing expected detail ' + expectedDetail + '; got ' + result.details.join(', ')
    );
  }
}

assert.equal(networkAttempted, false, 'RC-S6 conformance suite attempted network access');
console.log('RC-S6 offline conformance fixtures OK (' + EXPECTED_FILES.length + ' fixtures)');

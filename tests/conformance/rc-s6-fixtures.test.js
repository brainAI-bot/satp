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
  'trust-packet-negative-batch.json',
  'identity-stale.json',
  'attestation-revoked.json',
  'attestation-malformed.json',
  'issuer-unsupported.json',
  'review-weight-boundary.json',
  'escrow-reference-boundary.json',
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

function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch;
  if (!patch || typeof patch !== 'object') return patch;
  const output = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    output[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(output[key], value)
      : value;
  }
  return output;
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
  checkFreshness(record, errors, details);
}

function validateTrustPacket(record, errors, details) {
  checkSchema(record, 'satp.trustPacketFixture.v1', errors, details);
  const packet = record.packet;
  const result = validateSatpTrustPacket(packet);
  if (!result.ok) {
    addError(errors, details, 'trustPacket', result.errors.join('; '));
  } else {
    addDetail(details, 'trustPacket');
  }
  let expected = null;
  try {
    expected = buildSatpTrustPacket({
      subjectWallet: packet && packet.subjectWallet,
      agentId: packet && packet.agentId,
      claimType: packet && packet.claimType,
      metadataHash: packet && packet.metadataHash,
      attester: packet && packet.attester,
      network: packet && packet.network,
      expiresAt: packet && packet.expiresAt,
    });
  } catch (err) {
    addError(errors, details, 'trustPacket', 'packet cannot be re-derived: ' + err.message);
  }
  if (expected && !sameJsonValue(packet, expected)) {
    addError(errors, details, 'trustPacket', 'packet does not match deterministic SDK output');
  }
  if (packet && packet.flags && packet.flags.signingRequired === false && packet.flags.transactionRequired === false && packet.flags.writesRequired === false && packet.flags.livePaymentRequired === false) {
    addDetail(details, 'readOnlyFlags');
  } else {
    addError(errors, details, 'readOnlyFlags', 'packet flags are not read-only');
  }
  checkNoMutationIndicators(packet, errors, details);
  if (!details.has('noMutationIndicators')) {
    addDetail(details, 'noMutationIndicators');
  }
  if (record.issuerTrustClass !== undefined) {
    checkIssuerTrustClass(record, errors, details);
  }
  if (record.canonicalClaimType !== undefined) {
    if (!SUPPORTED_CANONICAL_CLAIM_TYPES.has(record.canonicalClaimType)) {
      addError(errors, details, 'claimType', 'unsupported canonical claim type');
    } else if (packet && record.canonicalClaimType !== packet.claimType && !record.canonicalClaimType.endsWith('.' + packet.claimType)) {
      addError(errors, details, 'claimType', 'canonical claim type does not match packet claimType');
    } else {
      addDetail(details, 'claimType');
    }
  }
  if (record.status === 'revoked' || (record.revokedAt !== undefined && record.revokedAt !== null)) {
    addError(errors, details, 'revoked', 'revoked trust packet must fail closed');
  }
  if (record.status !== undefined && record.status !== 'active') {
    addError(errors, details, 'status', 'trust packet must be active');
  }
  checkFreshness({
    ...record,
    expiresAt: record.expiresAt === undefined && packet ? packet.expiresAt : record.expiresAt,
  }, errors, details);
  addDetail(details, 'noNetwork');
}

function validateTrustPacketBatch(record, errors, details) {
  checkSchema(record, 'satp.trustPacketCaseBatch.v1', errors, details);
  if (!Array.isArray(record.cases) || record.cases.length === 0) {
    addError(errors, details, 'trustPacketCaseBatch', 'cases are required');
    return;
  }
  for (const testCase of record.cases) {
    const caseErrors = [];
    const caseDetails = new Set();
    let packet = testCase.packet || null;
    if (!packet) {
      try {
        packet = buildSatpTrustPacket({
          ...record.basePacketOptions,
          ...testCase.packetOptions,
        });
      } catch (err) {
        addError(caseErrors, caseDetails, 'trustPacket', 'packet cannot be built: ' + err.message);
      }
    }
    if (packet && testCase.packetPatch) {
      packet = deepMerge(packet, testCase.packetPatch);
    }
    validateTrustPacket({
      schemaVersion: 'satp.trustPacketFixture.v1',
      recordType: 'trust-packet',
      ...(record.commonSemantics || {}),
      ...testCase,
      packet,
    }, caseErrors, caseDetails);
    const verdict = caseErrors.length > 0 ? 'fail' : 'pass';
    if (verdict !== testCase.expected.verdict) {
      addError(
        errors,
        details,
        'trustPacketCase.' + testCase.id,
        'expected ' + testCase.expected.verdict + ' but got ' + verdict + ': ' + caseErrors.join('; ')
      );
      continue;
    }
    for (const expectedDetail of testCase.expected.details) {
      if (!caseDetails.has(expectedDetail)) {
        addError(
          errors,
          details,
          'trustPacketCase.' + testCase.id,
          'missing expected detail ' + expectedDetail + '; got ' + [...caseDetails].sort().join(', ')
        );
      }
    }
    addDetail(details, 'trustPacketCase.' + testCase.id + '.' + verdict);
  }
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
  if (record.proposedValidationLevel > 2 && record.inputRefs.length < 2) {
    addDetail(details, 'noValidationPromotion');
    return 'warning';
  }
  return 'pass';
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
  if (record.amount !== null || record.mint !== null || ['funded', 'released'].includes(record.state)) {
    addError(errors, details, 'noEscrowActivation', 'escrow reference must not imply value-bearing activation');
  } else {
    addDetail(details, 'noEscrowActivation');
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
  } else if (record.recordType === 'trust-packet-case-batch') {
    validateTrustPacketBatch(record, errors, details);
  } else if (record.recordType === 'review-weight-boundary') {
    boundaryVerdict = validateReviewBoundary(record, errors, details);
  } else if (record.recordType === 'escrow-reference-boundary') {
    boundaryVerdict = validateEscrowBoundary(record, errors, details);
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

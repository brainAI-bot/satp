'use strict';

const crypto = require('crypto');
const { PublicKey } = require('@solana/web3.js');
const {
  getV3ProgramIds,
  hashAgentId,
  getGenesisPDA,
  getV3AttestationPDA,
} = require('./v3-pda');

const DEFAULT_NETWORK = 'devnet';
const DEFAULT_ATTESTER = '11111111111111111111111111111111';
const REQUEST_SCHEMA_VERSION = 'satp.identityAttestationRequest.v1';

function normalizeNetwork(network = DEFAULT_NETWORK) {
  if (network !== 'devnet' && network !== 'mainnet') {
    throw new Error('Invalid network: expected devnet or mainnet');
  }
  return network;
}

function normalizePublicKey(value, field) {
  try {
    return new PublicKey(value).toBase58();
  } catch (err) {
    throw new Error(`Invalid ${field}: expected a Solana public key`);
  }
}

function normalizeString(value, field, { maxBytes } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${field}: expected a non-empty string`);
  }
  const normalized = value.trim();
  if (maxBytes && Buffer.byteLength(normalized, 'utf8') > maxBytes) {
    throw new Error(`Invalid ${field}: expected at most ${maxBytes} UTF-8 bytes`);
  }
  return normalized;
}

function normalizeMetadataHash(metadataHash) {
  if (typeof metadataHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(metadataHash)) {
    throw new Error('Invalid metadataHash: expected a 32-byte hex string');
  }
  return metadataHash.toLowerCase();
}

function normalizeExpiresAt(expiresAt) {
  if (expiresAt === undefined || expiresAt === null) return null;
  if (!Number.isSafeInteger(expiresAt) || expiresAt < 0) {
    throw new Error('Invalid expiresAt: expected a non-negative safe integer Unix timestamp');
  }
  return expiresAt;
}

function publicProgramIds(network) {
  const ids = getV3ProgramIds(network);
  return {
    identity: ids.IDENTITY.toBase58(),
    attestations: ids.ATTESTATIONS.toBase58(),
  };
}

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

function hashObject(value) {
  return crypto.createHash('sha256').update(canonicalStringify(value), 'utf8').digest('hex');
}

/**
 * Prepare a deterministic, offline, unsigned identity-attestation request.
 *
 * This helper derives request metadata only. It does not connect to RPC, read a
 * credentials, build a transaction, sign, send, or mutate chain state.
 *
 * @param {object} opts
 * @param {string|PublicKey} opts.subjectWallet - Wallet controlled by the attested identity.
 * @param {string} [opts.agentId=subjectWallet] - SATP agent identifier used for V3 PDA seeds.
 * @param {string} [opts.claimType] - Human-readable attestation type.
 * @param {string} [opts.attestationType=claimType] - Alias for claimType.
 * @param {string} opts.metadataHash - 32-byte hex SHA-256 hash of the off-chain metadata/proof.
 * @param {string|PublicKey} [opts.attester] - Attester/issuer public key.
 * @param {'devnet'|'mainnet'} [opts.network='devnet']
 * @param {number|null} [opts.expiresAt=null] - Optional Unix timestamp for downstream signing.
 * @returns {object} Plain JSON-safe request metadata.
 */
function prepareIdentityAttestationRequest(opts = {}) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('Invalid opts: expected an options object');
  }
  const network = normalizeNetwork(opts.network);
  const subjectWallet = normalizePublicKey(opts.subjectWallet, 'subjectWallet');
  const agentId = normalizeString(opts.agentId || subjectWallet, 'agentId');
  const claimType = normalizeString(opts.claimType || opts.attestationType, 'claimType', { maxBytes: 32 });
  const metadataHash = normalizeMetadataHash(opts.metadataHash);
  const attester = normalizePublicKey(opts.attester || opts.issuer || DEFAULT_ATTESTER, 'attester');
  const expiresAt = normalizeExpiresAt(opts.expiresAt);
  const agentIdHash = hashAgentId(agentId).toString('hex');
  const [genesisPda, genesisBump] = getGenesisPDA(Buffer.from(agentIdHash, 'hex'), network);
  const [attestationPda, attestationBump] = getV3AttestationPDA(Buffer.from(agentIdHash, 'hex'), attester, claimType, network);

  const request = {
    schemaVersion: REQUEST_SCHEMA_VERSION,
    requestType: 'identity-attestation',
    mode: 'unsigned-readonly-request',
    network,
    signingRequired: false,
    unsigned: true,
    subjectWallet,
    agentId,
    attester,
    claimType,
    attestationType: claimType,
    metadataHash,
    proofData: JSON.stringify({ metadataHash }),
    expiresAt,
    agentIdHash,
    genesisPda: genesisPda.toBase58(),
    genesisBump,
    attestationPda: attestationPda.toBase58(),
    attestationBump,
    programs: publicProgramIds(network),
    instructions: [],
    signers: [],
    transaction: null,
  };

  return {
    ...request,
    requestHash: hashObject(request),
  };
}

function appendMismatch(errors, field, actual, expected) {
  try {
    if (canonicalStringify(actual) !== canonicalStringify(expected)) {
      errors.push(`${field} does not match the value derived from public inputs`);
    }
  } catch (err) {
    errors.push(`${field} must be canonical JSON-compatible data`);
  }
}

function appendExpectation(errors, field, actual, expected, normalize) {
  if (expected === undefined) return;

  try {
    const normalizedExpected = normalize ? normalize(expected) : expected;
    if (actual !== normalizedExpected) {
      errors.push(`${field} does not match the expected value`);
    }
  } catch (err) {
    errors.push(`expected ${field}: ${err.message}`);
  }
}

/**
 * Verify an offline identity-attestation request from public inputs only.
 *
 * The verifier recomputes the canonical request hash, program IDs, agent hash,
 * and PDAs. It never connects to RPC, reads credentials, builds a transaction,
 * signs, sends, or mutates chain state.
 *
 * @param {object} request
 * @param {object} [expectations]
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
function verifyIdentityAttestationRequest(request, expectations = {}) {
  const errors = [];
  const warnings = [];

  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, errors: ['request must be an object'], warnings };
  }
  if (!expectations || typeof expectations !== 'object' || Array.isArray(expectations)) {
    return { ok: false, errors: ['expectations must be an object'], warnings };
  }

  if (request.schemaVersion !== REQUEST_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${REQUEST_SCHEMA_VERSION}`);
  }
  if (request.requestType !== 'identity-attestation') {
    errors.push('requestType must be identity-attestation');
  }
  if (request.mode !== 'unsigned-readonly-request') {
    errors.push('mode must be unsigned-readonly-request');
  }
  if (request.signingRequired !== false) {
    errors.push('signingRequired must be false');
  }
  if (request.unsigned !== true) {
    errors.push('unsigned must be true');
  }
  if (!Array.isArray(request.instructions) || request.instructions.length !== 0) {
    errors.push('instructions must be an empty array');
  }
  if (!Array.isArray(request.signers) || request.signers.length !== 0) {
    errors.push('signers must be an empty array');
  }
  if (request.transaction !== null) {
    errors.push('transaction must be null');
  }

  const hashPayload = { ...request };
  delete hashPayload.requestHash;
  let recomputedRequestHash;
  try {
    recomputedRequestHash = hashObject(hashPayload);
  } catch (err) {
    errors.push('request payload must be canonical JSON-compatible data');
  }
  if (typeof request.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(request.requestHash)) {
    errors.push('requestHash must be a lowercase 32-byte hex string');
  } else if (recomputedRequestHash && request.requestHash !== recomputedRequestHash) {
    errors.push('requestHash does not match the canonical request payload');
  }

  let expectedRequest;
  try {
    expectedRequest = prepareIdentityAttestationRequest({
      subjectWallet: request.subjectWallet,
      agentId: request.agentId,
      claimType: request.claimType,
      metadataHash: request.metadataHash,
      attester: request.attester,
      network: request.network,
      expiresAt: request.expiresAt,
    });
  } catch (err) {
    errors.push(`public inputs are invalid: ${err.message}`);
  }

  if (expectedRequest) {
    for (const field of [
      'network',
      'subjectWallet',
      'agentId',
      'attester',
      'claimType',
      'attestationType',
      'metadataHash',
      'proofData',
      'expiresAt',
      'agentIdHash',
      'genesisPda',
      'genesisBump',
      'attestationPda',
      'attestationBump',
      'programs',
      'requestHash',
    ]) {
      appendMismatch(errors, field, request[field], expectedRequest[field]);
    }
  }

  appendExpectation(
    errors,
    'subjectWallet',
    request.subjectWallet,
    expectations.expectedSubjectWallet,
    (value) => normalizePublicKey(value, 'expectedSubjectWallet'),
  );
  appendExpectation(
    errors,
    'agentId',
    request.agentId,
    expectations.expectedAgentId,
    (value) => normalizeString(value, 'expectedAgentId'),
  );
  appendExpectation(
    errors,
    'claimType',
    request.claimType,
    expectations.expectedClaimType,
    (value) => normalizeString(value, 'expectedClaimType', { maxBytes: 32 }),
  );
  appendExpectation(
    errors,
    'metadataHash',
    request.metadataHash,
    expectations.expectedMetadataHash,
    normalizeMetadataHash,
  );
  appendExpectation(
    errors,
    'attester',
    request.attester,
    expectations.expectedAttester,
    (value) => normalizePublicKey(value, 'expectedAttester'),
  );
  appendExpectation(
    errors,
    'network',
    request.network,
    expectations.expectedNetwork,
    normalizeNetwork,
  );
  appendExpectation(
    errors,
    'expiresAt',
    request.expiresAt,
    expectations.expectedExpiresAt,
    normalizeExpiresAt,
  );

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = {
  prepareIdentityAttestationRequest,
  verifyIdentityAttestationRequest,
};

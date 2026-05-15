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

module.exports = {
  prepareIdentityAttestationRequest,
};

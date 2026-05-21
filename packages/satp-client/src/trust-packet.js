'use strict';

const { prepareIdentityAttestationRequest } = require('./attestation-request');

const TRUST_PACKET_SCHEMA_VERSION = 'satp.trustPacket.v1';

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalStringify(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sameJsonValue(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

/**
 * Build a deterministic, read-only SATP trust packet for consumer preflight.
 *
 * The packet wraps the unsigned identity-attestation request with the derived
 * program IDs, Genesis PDA, attestation PDA, request hash, and explicit flags
 * proving that no signer, transaction, instruction, RPC write, or payment is
 * required to consume it.
 */
function buildSatpTrustPacket(opts = {}) {
  const request = prepareIdentityAttestationRequest(opts);
  return {
    schemaVersion: TRUST_PACKET_SCHEMA_VERSION,
    packetType: 'satp-trust-packet',
    mode: 'offline-readonly-trust-packet',
    network: request.network,
    subjectWallet: request.subjectWallet,
    agentId: request.agentId,
    claimType: request.claimType,
    attestationType: request.attestationType,
    metadataHash: request.metadataHash,
    attester: request.attester,
    expiresAt: request.expiresAt,
    programs: { ...request.programs },
    pda: {
      genesis: request.genesisPda,
      genesisBump: request.genesisBump,
      attestation: request.attestationPda,
      attestationBump: request.attestationBump,
    },
    requestHash: request.requestHash,
    flags: {
      signingRequired: false,
      transactionRequired: false,
      writesRequired: false,
      livePaymentRequired: false,
      unsigned: true,
      noSign: true,
      noTransaction: true,
    },
    instructions: [],
    signers: [],
    transaction: null,
    request,
  };
}

function validateSatpTrustPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== 'object') {
    return { ok: false, errors: ['packet must be an object'] };
  }

  if (packet.schemaVersion !== TRUST_PACKET_SCHEMA_VERSION) {
    errors.push('schemaVersion must be ' + TRUST_PACKET_SCHEMA_VERSION);
  }
  if (packet.packetType !== 'satp-trust-packet') {
    errors.push('packetType must be satp-trust-packet');
  }
  if (packet.mode !== 'offline-readonly-trust-packet') {
    errors.push('mode must be offline-readonly-trust-packet');
  }

  const expectedFlags = {
    signingRequired: false,
    transactionRequired: false,
    writesRequired: false,
    livePaymentRequired: false,
    unsigned: true,
    noSign: true,
    noTransaction: true,
  };
  if (!sameJsonValue(packet.flags, expectedFlags)) {
    errors.push('flags must be read-only, unsigned, and no-transaction');
  }
  if (!Array.isArray(packet.instructions) || packet.instructions.length !== 0) {
    errors.push('instructions must be an empty array');
  }
  if (!Array.isArray(packet.signers) || packet.signers.length !== 0) {
    errors.push('signers must be an empty array');
  }
  if (packet.transaction !== null) {
    errors.push('transaction must be null');
  }

  let expected;
  try {
    expected = buildSatpTrustPacket({
      subjectWallet: packet.subjectWallet,
      agentId: packet.agentId,
      claimType: packet.claimType || packet.attestationType,
      metadataHash: packet.metadataHash,
      attester: packet.attester,
      network: packet.network,
      expiresAt: packet.expiresAt,
    });
  } catch (err) {
    errors.push('packet cannot be re-derived: ' + err.message);
    return { ok: false, errors };
  }

  const fields = [
    'network',
    'subjectWallet',
    'agentId',
    'claimType',
    'attestationType',
    'metadataHash',
    'attester',
    'expiresAt',
    'programs',
    'pda',
    'requestHash',
    'request',
  ];
  for (const field of fields) {
    if (!sameJsonValue(packet[field], expected[field])) {
      errors.push(field + ' does not match derived trust packet');
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  TRUST_PACKET_SCHEMA_VERSION,
  buildSatpTrustPacket,
  validateSatpTrustPacket,
};

'use strict';

const crypto = require('crypto');
const { PublicKey } = require('@solana/web3.js');
const { prepareIdentityAttestationRequest } = require('../../../packages/satp-client/src');

const DEFAULT_NETWORK = 'devnet';
const DEFAULT_ATTESTER = '11111111111111111111111111111111';
const EXAMPLE_KIND = 'agentfolio-satp-consumer-readonly.v1';

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
    throw new Error('Invalid ' + field + ': expected a Solana public key');
  }
}

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Invalid ' + field + ': expected a non-empty string');
  }
  return value.trim();
}

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalStringify(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function sameJsonValue(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function buildTrustMetadata(profile, signal) {
  return {
    kind: EXAMPLE_KIND,
    profileId: profile.profileId,
    agentId: profile.agentId || profile.profileId,
    wallet: profile.wallet,
    claimType: signal.claimType,
    issuer: signal.issuer,
    subject: signal.subject,
    evidenceUri: signal.evidenceUri,
  };
}

function buildAgentFolioSatpConsumerRecord({
  profile,
  network = DEFAULT_NETWORK,
  attester = DEFAULT_ATTESTER,
} = {}) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Invalid profile: expected an AgentFolio-style profile object');
  }

  const selectedNetwork = normalizeNetwork(network);
  const subjectWallet = normalizePublicKey(profile.wallet, 'profile.wallet');
  const profileId = requiredString(profile.profileId, 'profile.profileId');
  const agentId = requiredString(profile.agentId || profileId, 'profile.agentId');
  const displayName = requiredString(profile.displayName, 'profile.displayName');
  const profileUri = requiredString(profile.profileUri, 'profile.profileUri');
  const signals = Array.isArray(profile.trustSignals) ? profile.trustSignals : [];
  if (signals.length === 0) {
    throw new Error('Invalid profile.trustSignals: expected at least one trust signal');
  }

  const trustInputs = signals.map((signal) => {
    const claimType = requiredString(signal.claimType, 'trustSignals[].claimType');
    const metadata = buildTrustMetadata({ ...profile, wallet: subjectWallet, profileId, agentId }, signal);
    const metadataHash = sha256Hex(canonicalStringify(metadata));
    const request = prepareIdentityAttestationRequest({
      subjectWallet,
      agentId,
      claimType,
      metadataHash,
      network: selectedNetwork,
      attester,
    });

    return {
      claimType,
      metadata,
      metadataHash,
      request,
    };
  });

  return {
    schemaVersion: EXAMPLE_KIND,
    mode: 'offline-readonly-consumer-preflight',
    source: 'agentfolio-consumer-readonly-example',
    network: selectedNetwork,
    profile: {
      profileId,
      displayName,
      profileUri,
      wallet: subjectWallet,
      capabilities: Array.isArray(profile.capabilities) ? [...profile.capabilities] : [],
    },
    satp: {
      agentId,
      subjectWallet,
      trustInputs,
    },
    integration: {
      agentfolioRole: 'consumer-adapter',
      mcpRole: 'can expose this record through a read-only tool',
      x402Role: 'can gate access before returning this read-only record',
      signingRequired: false,
      writesRequired: false,
      livePaymentRequired: false,
    },
  };
}

function verifyAgentFolioSatpConsumerRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object') {
    return { ok: false, errors: ['record must be an object'] };
  }

  const inputs = record.satp?.trustInputs;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    errors.push('satp.trustInputs must contain at least one request');
  } else {
    for (const [index, input] of inputs.entries()) {
      const expectedHash = sha256Hex(canonicalStringify(input.metadata));
      if (input.metadataHash !== expectedHash) {
        errors.push('trustInputs[' + index + '].metadataHash does not match metadata');
      }

      if (!input.request || typeof input.request !== 'object') {
        errors.push('trustInputs[' + index + '].request must be an object');
        continue;
      }

      const expectedRequest = prepareIdentityAttestationRequest({
        subjectWallet: record.satp.subjectWallet,
        agentId: record.satp.agentId,
        claimType: input.claimType,
        metadataHash: input.metadataHash,
        network: record.network,
        attester: input.request.attester,
        expiresAt: input.request.expiresAt,
      });

      const expectedFields = [
        'requestHash',
        'attestationPda',
        'programs',
        'subjectWallet',
        'agentId',
        'metadataHash',
        'signingRequired',
        'unsigned',
      ];

      for (const field of expectedFields) {
        if (!sameJsonValue(input.request[field], expectedRequest[field])) {
          errors.push('trustInputs[' + index + '].request.' + field + ' does not match derived request');
        }
      }

      if (input.request.transaction !== null || !Array.isArray(input.request.instructions) || input.request.instructions.length !== 0) {
        errors.push('trustInputs[' + index + '].request must not include a transaction or instructions');
      }
    }
  }

  if (record.integration?.writesRequired !== false || record.integration?.signingRequired !== false) {
    errors.push('integration flags must stay read-only and unsigned');
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  buildAgentFolioSatpConsumerRecord,
  verifyAgentFolioSatpConsumerRecord,
  canonicalStringify,
  sha256Hex,
};

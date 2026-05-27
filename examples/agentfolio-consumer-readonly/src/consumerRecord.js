'use strict';

const crypto = require('crypto');
const { PublicKey } = require('@solana/web3.js');
const {
  buildSatpTrustPacket,
  buildWalletControlChallenge,
  canonicalWalletControlChallenge,
  prepareIdentityAttestationRequest,
  validateSatpTrustPacket,
  verifyWalletControlChallengeSignature,
} = require('../../../packages/satp-client/src');

const DEFAULT_NETWORK = 'devnet';
const DEFAULT_ATTESTER = '11111111111111111111111111111111';
const DEFAULT_WALLET_CONTROL_DOMAIN = 'agentfolio.example.wallet-control';
const DEFAULT_WALLET_CONTROL_AUDIENCE = 'agentfolio-consumer-readonly';
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

function normalizeSignature(value, field) {
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (value instanceof Uint8Array || Array.isArray(value)) return Buffer.from(value).toString('base64');
  return requiredString(value, field);
}

function walletControlSignal(profile) {
  const signals = Array.isArray(profile.trustSignals) ? profile.trustSignals : [];
  return signals.find((signal) => signal && signal.claimType === 'wallet_control_verified') || {
    claimType: 'wallet_control_verified',
    issuer: 'agentfolio-runtime-example',
    subject: profile.wallet,
    evidenceUri: 'wallet-adapter://signMessage',
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
    const trustPacket = buildSatpTrustPacket({
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
      trustPacket,
      request: trustPacket.request,
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

function prepareAgentFolioWalletControlChallenge({
  profile,
  network = DEFAULT_NETWORK,
  domain = DEFAULT_WALLET_CONTROL_DOMAIN,
  audience = DEFAULT_WALLET_CONTROL_AUDIENCE,
  nonce,
  issuedAt,
  expiresAt,
} = {}) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Invalid profile: expected an AgentFolio-style profile object');
  }

  const selectedNetwork = normalizeNetwork(network);
  const subjectWallet = normalizePublicKey(profile.wallet, 'profile.wallet');
  const profileId = requiredString(profile.profileId, 'profile.profileId');
  const agentId = requiredString(profile.agentId || profileId, 'profile.agentId');
  const challenge = buildWalletControlChallenge({
    network: selectedNetwork,
    agentId,
    wallet: subjectWallet,
    domain,
    audience,
    nonce,
    issuedAt,
    expiresAt,
  });

  return {
    schemaVersion: 'agentfolio.walletControlChallengeRequest.v1',
    mode: 'wallet-adapter-sign-message',
    challenge,
    message: canonicalWalletControlChallenge(challenge),
    messageEncoding: 'utf8',
    wallet: subjectWallet,
    agentId,
    signing: {
      expectedWalletAdapterMethod: 'signMessage',
      keypairExportRequired: false,
      rpcRequired: false,
      transactionRequired: false,
    },
  };
}

function buildAgentFolioRuntimePreflight({
  profile,
  walletControlChallenge,
  walletControlSignature,
  network = DEFAULT_NETWORK,
  attester = DEFAULT_ATTESTER,
  now,
  usedNonces,
  replayCache,
} = {}) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Invalid profile: expected an AgentFolio-style profile object');
  }
  if (!walletControlChallenge || typeof walletControlChallenge !== 'object') {
    throw new Error('Invalid walletControlChallenge: expected a challenge object');
  }

  const selectedNetwork = normalizeNetwork(network);
  const subjectWallet = normalizePublicKey(profile.wallet, 'profile.wallet');
  const profileId = requiredString(profile.profileId, 'profile.profileId');
  const agentId = requiredString(profile.agentId || profileId, 'profile.agentId');
  const signature = normalizeSignature(walletControlSignature, 'walletControlSignature');
  const walletControlVerification = verifyWalletControlChallengeSignature({
    challenge: walletControlChallenge,
    signature,
    expectedWallet: subjectWallet,
    expectedAgentId: agentId,
    expectedDomain: walletControlChallenge.domain,
    expectedAudience: walletControlChallenge.audience,
    now,
    usedNonces,
    replayCache,
  });
  const signal = walletControlSignal({ ...profile, wallet: subjectWallet, profileId, agentId });
  const metadata = buildTrustMetadata({ ...profile, wallet: subjectWallet, profileId, agentId }, signal);
  const metadataHash = sha256Hex(canonicalStringify(metadata));
  const identityAttestationRequest = prepareIdentityAttestationRequest({
    subjectWallet,
    agentId,
    claimType: signal.claimType,
    metadataHash,
    network: selectedNetwork,
    attester,
  });
  const consumerRecord = buildAgentFolioSatpConsumerRecord({
    profile: { ...profile, wallet: subjectWallet, agentId },
    network: selectedNetwork,
    attester,
  });
  const consumerVerification = verifyAgentFolioSatpConsumerRecord(consumerRecord);

  return {
    schemaVersion: 'agentfolio.satpRuntimePreflight.v1',
    mode: 'offline-wallet-control-and-identity-attestation-preflight',
    network: selectedNetwork,
    readyForQueue: walletControlVerification.ok && consumerVerification.ok,
    walletControl: {
      challenge: walletControlChallenge,
      signature,
      verification: walletControlVerification,
    },
    identityAttestation: {
      metadata,
      metadataHash,
      request: identityAttestationRequest,
      directHelper: 'prepareIdentityAttestationRequest',
    },
    agentfolioConsumer: {
      record: consumerRecord,
      verification: consumerVerification,
    },
    boundaries: {
      npmPublishRequired: false,
      solanaWriteRequired: false,
      keypairReadRequired: false,
      productionDeployRequired: false,
      publicLaunchRequired: false,
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

      if (!input.trustPacket || typeof input.trustPacket !== 'object') {
        errors.push('trustInputs[' + index + '].trustPacket must be an object');
      } else {
        const trustPacketResult = validateSatpTrustPacket(input.trustPacket);
        if (!trustPacketResult.ok) {
          errors.push('trustInputs[' + index + '].trustPacket invalid: ' + trustPacketResult.errors.join('; '));
        }
      }

      const expectedTrustPacket = buildSatpTrustPacket({
        subjectWallet: record.satp.subjectWallet,
        agentId: record.satp.agentId,
        claimType: input.claimType,
        metadataHash: input.metadataHash,
        network: record.network,
        attester: input.request.attester,
        expiresAt: input.request.expiresAt,
      });
      const expectedRequest = expectedTrustPacket.request;

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

      if (input.trustPacket && !sameJsonValue(input.trustPacket, expectedTrustPacket)) {
        errors.push('trustInputs[' + index + '].trustPacket does not match derived trust packet');
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
  prepareAgentFolioWalletControlChallenge,
  buildAgentFolioRuntimePreflight,
  verifyAgentFolioSatpConsumerRecord,
  canonicalStringify,
  sha256Hex,
};

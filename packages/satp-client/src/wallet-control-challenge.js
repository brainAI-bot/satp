'use strict';

const crypto = require('crypto');
const { PublicKey } = require('@solana/web3.js');
const bs58Module = require('bs58');
const {
  hashAgentId,
  getGenesisPDA,
  getLinkedWalletPDA,
} = require('./v3-pda');

const bs58 = bs58Module.default || bs58Module;

const WALLET_CONTROL_CHALLENGE_SCHEMA_VERSION = 'satp.walletControlChallenge.v1';
const WALLET_CONTROL_CHALLENGE_TYPE = 'wallet-control';
const DEFAULT_WALLET_CONTROL_DOMAIN = 'satp.brainai.wallet-control';
const DEFAULT_WALLET_CONTROL_AUDIENCE = 'satp-client';
const DEFAULT_TTL_SECONDS = 300;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalStringify(value[key]))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

function normalizeNetwork(network = 'devnet') {
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

function normalizeString(value, field, { maxBytes } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Invalid ' + field + ': expected a non-empty string');
  }
  const normalized = value.trim();
  if (maxBytes && Buffer.byteLength(normalized, 'utf8') > maxBytes) {
    throw new Error('Invalid ' + field + ': expected at most ' + maxBytes + ' UTF-8 bytes');
  }
  return normalized;
}

function normalizeTimestamp(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid ' + field + ': expected a non-negative safe integer Unix timestamp');
  }
  return value;
}

function hasReplayNonce(container, nonce) {
  if (!container) return false;
  if (typeof container.has === 'function') return !!container.has(nonce);
  if (Array.isArray(container)) return container.includes(nonce);
  if (typeof container === 'object') return !!container[nonce];
  return false;
}

function decodeSignature(signature) {
  if (Buffer.isBuffer(signature)) return signature;
  if (signature instanceof Uint8Array || Array.isArray(signature)) return Buffer.from(signature);
  if (typeof signature !== 'string' || signature.trim() === '') {
    throw new Error('Invalid signature: expected base58, base64, hex, Buffer, or Uint8Array');
  }
  const value = signature.trim();
  try {
    return Buffer.from(bs58.decode(value));
  } catch (err) {
    // Fall through to base64/hex decoders.
  }
  if (/^[a-fA-F0-9]{128}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }
  const base64 = Buffer.from(value, 'base64');
  if (base64.length === 64) return base64;
  throw new Error('Invalid signature: expected 64-byte Ed25519 signature');
}

function ed25519PublicKeyFromSolanaPublicKey(wallet) {
  const walletKey = new PublicKey(wallet);
  return crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, walletKey.toBuffer()]),
    format: 'der',
    type: 'spki',
  });
}

function deriveWalletControlChallengePdas({ agentId, wallet, network = 'devnet' } = {}) {
  const normalizedNetwork = normalizeNetwork(network);
  const normalizedAgentId = normalizeString(agentId, 'agentId');
  const normalizedWallet = normalizePublicKey(wallet, 'wallet');
  const agentIdHash = hashAgentId(normalizedAgentId);
  const [genesisPda, genesisBump] = getGenesisPDA(agentIdHash, normalizedNetwork);
  const [linkedWalletPda, linkedWalletBump] = getLinkedWalletPDA(genesisPda, normalizedWallet, normalizedNetwork);

  return {
    agentIdHash: agentIdHash.toString('hex'),
    genesisPda: genesisPda.toBase58(),
    genesisBump,
    linkedWalletPda: linkedWalletPda.toBase58(),
    linkedWalletBump,
  };
}

function normalizeWalletControlChallenge(challenge) {
  if (!challenge || typeof challenge !== 'object') {
    throw new Error('Invalid challenge: expected an object');
  }

  const network = normalizeNetwork(challenge.network);
  const agentId = normalizeString(challenge.agentId, 'agentId');
  const wallet = normalizePublicKey(challenge.wallet, 'wallet');
  const domain = normalizeString(challenge.domain, 'domain', { maxBytes: 128 });
  const audience = normalizeString(challenge.audience, 'audience', { maxBytes: 128 });
  const nonce = normalizeString(challenge.nonce, 'nonce', { maxBytes: 128 });
  const issuedAt = normalizeTimestamp(challenge.issuedAt, 'issuedAt');
  const expiresAt = normalizeTimestamp(challenge.expiresAt, 'expiresAt');
  const derived = deriveWalletControlChallengePdas({ agentId, wallet, network });

  return {
    schemaVersion: challenge.schemaVersion,
    challengeType: challenge.challengeType,
    domain,
    audience,
    network,
    agentId,
    wallet,
    nonce,
    issuedAt,
    expiresAt,
    agentIdHash: challenge.agentIdHash,
    genesisPda: challenge.genesisPda,
    genesisBump: challenge.genesisBump,
    linkedWalletPda: challenge.linkedWalletPda,
    linkedWalletBump: challenge.linkedWalletBump,
    derived,
  };
}

function buildWalletControlChallenge(opts = {}) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('Invalid opts: expected an options object');
  }

  const network = normalizeNetwork(opts.network);
  const agentId = normalizeString(opts.agentId, 'agentId');
  const wallet = normalizePublicKey(opts.wallet, 'wallet');
  const domain = normalizeString(opts.domain || DEFAULT_WALLET_CONTROL_DOMAIN, 'domain', { maxBytes: 128 });
  const audience = normalizeString(opts.audience || DEFAULT_WALLET_CONTROL_AUDIENCE, 'audience', { maxBytes: 128 });
  const nonce = normalizeString(opts.nonce || crypto.randomBytes(16).toString('hex'), 'nonce', { maxBytes: 128 });
  const issuedAt = normalizeTimestamp(
    opts.issuedAt === undefined ? Math.floor(Date.now() / 1000) : opts.issuedAt,
    'issuedAt'
  );
  const expiresAt = normalizeTimestamp(
    opts.expiresAt === undefined ? issuedAt + DEFAULT_TTL_SECONDS : opts.expiresAt,
    'expiresAt'
  );
  const derived = deriveWalletControlChallengePdas({ agentId, wallet, network });

  return {
    schemaVersion: WALLET_CONTROL_CHALLENGE_SCHEMA_VERSION,
    challengeType: WALLET_CONTROL_CHALLENGE_TYPE,
    domain,
    audience,
    network,
    agentId,
    wallet,
    nonce,
    issuedAt,
    expiresAt,
    agentIdHash: derived.agentIdHash,
    genesisPda: derived.genesisPda,
    genesisBump: derived.genesisBump,
    linkedWalletPda: derived.linkedWalletPda,
    linkedWalletBump: derived.linkedWalletBump,
  };
}

function canonicalWalletControlChallenge(challenge) {
  const normalized = normalizeWalletControlChallenge(challenge);
  return canonicalStringify({
    schemaVersion: normalized.schemaVersion,
    challengeType: normalized.challengeType,
    domain: normalized.domain,
    audience: normalized.audience,
    network: normalized.network,
    agentId: normalized.agentId,
    wallet: normalized.wallet,
    nonce: normalized.nonce,
    issuedAt: normalized.issuedAt,
    expiresAt: normalized.expiresAt,
    agentIdHash: normalized.agentIdHash,
    genesisPda: normalized.genesisPda,
    genesisBump: normalized.genesisBump,
    linkedWalletPda: normalized.linkedWalletPda,
    linkedWalletBump: normalized.linkedWalletBump,
  });
}

function hashWalletControlChallenge(challenge) {
  return crypto
    .createHash('sha256')
    .update(canonicalWalletControlChallenge(challenge), 'utf8')
    .digest('hex');
}

function verifyWalletControlChallengeSignature({
  challenge,
  signature,
  expectedWallet,
  expectedAgentId,
  expectedDomain = DEFAULT_WALLET_CONTROL_DOMAIN,
  expectedAudience = DEFAULT_WALLET_CONTROL_AUDIENCE,
  now = Math.floor(Date.now() / 1000),
  usedNonces,
  replayCache,
  isNonceUsed,
} = {}) {
  const errors = [];
  let normalized;

  try {
    normalized = normalizeWalletControlChallenge(challenge);
  } catch (err) {
    return { ok: false, errors: [err.message] };
  }

  if (normalized.schemaVersion !== WALLET_CONTROL_CHALLENGE_SCHEMA_VERSION) {
    errors.push('schemaVersion must be ' + WALLET_CONTROL_CHALLENGE_SCHEMA_VERSION);
  }
  if (normalized.challengeType !== WALLET_CONTROL_CHALLENGE_TYPE) {
    errors.push('challengeType must be ' + WALLET_CONTROL_CHALLENGE_TYPE);
  }
  if (normalized.domain !== expectedDomain) {
    errors.push('domain does not match expected domain');
  }
  if (normalized.audience !== expectedAudience) {
    errors.push('audience does not match expected audience');
  }
  if (expectedAgentId !== undefined && normalized.agentId !== expectedAgentId) {
    errors.push('agentId does not match expected agentId');
  }
  if (expectedWallet !== undefined) {
    let normalizedExpectedWallet;
    try {
      normalizedExpectedWallet = normalizePublicKey(expectedWallet, 'expectedWallet');
    } catch (err) {
      errors.push(err.message);
    }
    if (normalizedExpectedWallet && normalized.wallet !== normalizedExpectedWallet) {
      errors.push('wallet does not match expected wallet');
    }
  }

  if (normalized.expiresAt <= normalized.issuedAt) {
    errors.push('expiresAt must be after issuedAt');
  }
  if (!Number.isSafeInteger(now) || now < 0) {
    errors.push('now must be a non-negative safe integer Unix timestamp');
  } else {
    if (normalized.issuedAt > now) {
      errors.push('challenge issuedAt is in the future');
    }
    if (normalized.expiresAt <= now) {
      errors.push('challenge is expired');
    }
  }

  if (normalized.agentIdHash !== normalized.derived.agentIdHash) {
    errors.push('agentIdHash does not match derived agentId hash');
  }
  if (normalized.genesisPda !== normalized.derived.genesisPda || normalized.genesisBump !== normalized.derived.genesisBump) {
    errors.push('genesis PDA does not match derived wallet-control challenge');
  }
  if (normalized.linkedWalletPda !== normalized.derived.linkedWalletPda || normalized.linkedWalletBump !== normalized.derived.linkedWalletBump) {
    errors.push('linked wallet PDA does not match derived wallet-control challenge');
  }

  try {
    if (hasReplayNonce(usedNonces, normalized.nonce) || hasReplayNonce(replayCache, normalized.nonce)) {
      errors.push('nonce has already been used');
    }
    if (typeof isNonceUsed === 'function' && isNonceUsed(normalized.nonce, normalized) === true) {
      errors.push('nonce has already been used');
    }
  } catch (err) {
    errors.push('replay check failed: ' + err.message);
  }

  let signatureBytes;
  try {
    signatureBytes = decodeSignature(signature);
    if (signatureBytes.length !== 64) {
      errors.push('signature must be 64 bytes');
    }
  } catch (err) {
    errors.push(err.message);
  }

  if (signatureBytes && signatureBytes.length === 64) {
    try {
      const signedMessage = Buffer.from(canonicalWalletControlChallenge(challenge), 'utf8');
      const verified = crypto.verify(
        null,
        signedMessage,
        ed25519PublicKeyFromSolanaPublicKey(normalized.wallet),
        signatureBytes
      );
      if (!verified) {
        errors.push('signature does not verify for wallet');
      }
    } catch (err) {
      errors.push('signature verification failed: ' + err.message);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    challengeHash: hashWalletControlChallenge(challenge),
  };
}

module.exports = {
  WALLET_CONTROL_CHALLENGE_SCHEMA_VERSION,
  WALLET_CONTROL_CHALLENGE_TYPE,
  DEFAULT_WALLET_CONTROL_DOMAIN,
  DEFAULT_WALLET_CONTROL_AUDIENCE,
  buildWalletControlChallenge,
  canonicalWalletControlChallenge,
  hashWalletControlChallenge,
  deriveWalletControlChallengePdas,
  verifyWalletControlChallengeSignature,
};

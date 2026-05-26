#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Keypair } = require('@solana/web3.js');
const {
  buildWalletControlChallenge,
  canonicalWalletControlChallenge,
  hashWalletControlChallenge,
  deriveWalletControlChallengePdas,
  verifyWalletControlChallengeSignature,
} = require('./src');

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function privateKeyFromSolanaKeypair(keypair) {
  return crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(keypair.secretKey).subarray(0, 32)]),
    format: 'der',
    type: 'pkcs8',
  });
}

function signChallenge(keypair, challenge) {
  return crypto.sign(
    null,
    Buffer.from(canonicalWalletControlChallenge(challenge), 'utf8'),
    privateKeyFromSolanaKeypair(keypair)
  );
}

const wallet = Keypair.generate();
const otherWallet = Keypair.generate();
const challenge = buildWalletControlChallenge({
  agentId: 'brainChain',
  wallet: wallet.publicKey,
  network: 'devnet',
  audience: 'satp-test-suite',
  nonce: 'wallet-control-nonce-001',
  issuedAt: 1893456000,
  expiresAt: 1893456300,
});
const signature = signChallenge(wallet, challenge);

assert.deepEqual(deriveWalletControlChallengePdas({
  agentId: 'brainChain',
  wallet: wallet.publicKey,
  network: 'devnet',
}), {
  agentIdHash: challenge.agentIdHash,
  genesisPda: challenge.genesisPda,
  genesisBump: challenge.genesisBump,
  linkedWalletPda: challenge.linkedWalletPda,
  linkedWalletBump: challenge.linkedWalletBump,
});
assert.match(canonicalWalletControlChallenge(challenge), /"agentId":"brainChain"/);
assert.match(hashWalletControlChallenge(challenge), /^[a-f0-9]{64}$/);

assert.deepEqual(verifyWalletControlChallengeSignature({
  challenge,
  signature,
  expectedWallet: wallet.publicKey,
  expectedAgentId: 'brainChain',
  expectedAudience: 'satp-test-suite',
  now: 1893456100,
}), {
  ok: true,
  errors: [],
  challengeHash: hashWalletControlChallenge(challenge),
});

function expectInvalid(match, overrides = {}) {
  const result = verifyWalletControlChallengeSignature({
    challenge,
    signature,
    expectedWallet: wallet.publicKey,
    expectedAgentId: 'brainChain',
    expectedAudience: 'satp-test-suite',
    now: 1893456100,
    ...overrides,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), match);
}

expectInvalid(/wallet does not match expected wallet/, {
  expectedWallet: otherWallet.publicKey,
});

expectInvalid(/signature does not verify for wallet/, {
  signature: signChallenge(otherWallet, challenge),
});

expectInvalid(/agentId does not match expected agentId/, {
  expectedAgentId: 'brainForge',
});

expectInvalid(/genesis PDA does not match derived wallet-control challenge/, {
  challenge: { ...challenge, genesisPda: challenge.linkedWalletPda },
});

expectInvalid(/linked wallet PDA does not match derived wallet-control challenge/, {
  challenge: { ...challenge, linkedWalletPda: challenge.genesisPda },
});

expectInvalid(/domain does not match expected domain/, {
  expectedDomain: 'wrong.domain',
});

expectInvalid(/audience does not match expected audience/, {
  expectedAudience: 'wrong-audience',
});

expectInvalid(/challenge is expired/, {
  now: 1893456300,
});

expectInvalid(/nonce has already been used/, {
  usedNonces: new Set(['wallet-control-nonce-001']),
});

assert.throws(() => buildWalletControlChallenge({
  agentId: 'brainChain',
  wallet: wallet.publicKey,
  network: 'mainnet',
  nonce: 'mainnet-fails-closed',
  issuedAt: 1893456000,
  expiresAt: 1893456300,
}), /SATP V3 mainnet program IDs are not configured/);

console.log('wallet-control challenge helper OK');

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Keypair } = require('@solana/web3.js');
const rcS6Fixture = require('./fixtures/wallet-control-rc-s6-conformance.json');
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

function deterministicKeypair(seedLabel) {
  return Keypair.fromSeed(crypto.createHash('sha256').update(seedLabel, 'utf8').digest());
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

const mainnetChallenge = buildWalletControlChallenge({
  agentId: 'brainChain',
  wallet: wallet.publicKey,
  network: 'mainnet',
  nonce: 'mainnet-v3-live',
  issuedAt: 1893456000,
  expiresAt: 1893456300,
});
assert.equal(mainnetChallenge.network, 'mainnet');
assert.match(mainnetChallenge.genesisPda, /^[1-9A-HJ-NP-Za-km-z]+$/);
assert.match(mainnetChallenge.linkedWalletPda, /^[1-9A-HJ-NP-Za-km-z]+$/);

assert.equal(rcS6Fixture.guardrail.offlineOnly, true);
assert.equal(rcS6Fixture.guardrail.noSolanaWrite, true);
assert.equal(rcS6Fixture.guardrail.noKeypairReadOrMovement, true);
assert.match(rcS6Fixture.guardrail.semanticRisk, /does not prove production wallet ownership/);

const fixtureCases = new Map();
for (const fixtureCase of rcS6Fixture.cases) {
  const baseCase = fixtureCase.challengeFrom ? fixtureCases.get(fixtureCase.challengeFrom) : null;
  assert.ok(!fixtureCase.challengeFrom || baseCase, `Missing RC-S6 base fixture: ${fixtureCase.challengeFrom}`);

  const seedLabel = fixtureCase.seedLabel || baseCase.seedLabel;
  const fixtureWallet = deterministicKeypair(seedLabel);
  const challengeOptions = fixtureCase.challenge || baseCase.challengeOptions;
  const fixtureChallenge = buildWalletControlChallenge({
    ...challengeOptions,
    wallet: fixtureWallet.publicKey,
  });
  const expectedWallet = fixtureCase.expectedWallet || baseCase.expectedWallet;
  assert.equal(fixtureWallet.publicKey.toBase58(), expectedWallet);

  const candidateChallenge = { ...fixtureChallenge };
  if (fixtureCase.tamper?.linkedWalletPdaFrom) {
    candidateChallenge.linkedWalletPda = candidateChallenge[fixtureCase.tamper.linkedWalletPdaFrom];
  }

  const verify = {
    expectedWallet: fixtureCase.expectedWallet || fixtureChallenge.wallet,
    expectedAgentId: challengeOptions.agentId,
    expectedDomain: challengeOptions.domain,
    expectedAudience: challengeOptions.audience,
    now: challengeOptions.issuedAt,
    ...(fixtureCase.verify || {}),
  };

  const result = verifyWalletControlChallengeSignature({
    challenge: candidateChallenge,
    signature: signChallenge(fixtureWallet, fixtureChallenge),
    expectedWallet: verify.expectedWallet,
    expectedAgentId: verify.expectedAgentId,
    expectedDomain: verify.expectedDomain,
    expectedAudience: verify.expectedAudience,
    now: verify.now,
    usedNonces: verify.usedNonces,
  });

  assert.equal(result.ok, fixtureCase.expect.ok, fixtureCase.id);
  for (const expectedError of fixtureCase.expect.errors) {
    assert.ok(
      result.errors.includes(expectedError),
      `${fixtureCase.id} missing expected error: ${expectedError}; got ${result.errors.join(', ')}`
    );
  }

  fixtureCases.set(fixtureCase.id, {
    seedLabel,
    expectedWallet,
    challengeOptions,
    challenge: fixtureChallenge,
  });
}

console.log('wallet-control challenge helper OK');

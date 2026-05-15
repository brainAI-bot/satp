#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  prepareIdentityAttestationRequest,
  hashAgentId,
  getGenesisPDA,
  getV3AttestationPDA,
} = require('./src');

const SUBJECT_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG';
const ATTESTER = 'Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc';
const METADATA_HASH = '4D9678A7869C25F26A2E38E43F70FC7D0C4142D20B1743A43E50CD8FD012F3D7';

function assertThrows(match, fn, label) {
  assert.throws(fn, match, label);
}

const request = prepareIdentityAttestationRequest({
  subjectWallet: SUBJECT_WALLET,
  agentId: 'brainChain',
  claimType: 'github_verified',
  metadataHash: METADATA_HASH,
  attester: ATTESTER,
  network: 'devnet',
});

assert.equal(request.schemaVersion, 'satp.identityAttestationRequest.v1');
assert.equal(request.requestType, 'identity-attestation');
assert.equal(request.mode, 'unsigned-readonly-request');
assert.equal(request.network, 'devnet');
assert.equal(request.subjectWallet, SUBJECT_WALLET);
assert.equal(request.agentId, 'brainChain');
assert.equal(request.claimType, 'github_verified');
assert.equal(request.attestationType, 'github_verified');
assert.equal(request.metadataHash, METADATA_HASH.toLowerCase());
assert.equal(request.attester, ATTESTER);
assert.equal(request.signingRequired, false);
assert.equal(request.unsigned, true);
assert.deepEqual(request.instructions, []);
assert.deepEqual(request.signers, []);
assert.equal(request.transaction, null);
assert.equal(request.expiresAt, null);

const agentIdHash = hashAgentId('brainChain');
const [expectedGenesis, expectedGenesisBump] = getGenesisPDA(agentIdHash, 'devnet');
const [expectedAttestation, expectedAttestationBump] = getV3AttestationPDA(
  agentIdHash,
  ATTESTER,
  'github_verified',
  'devnet'
);

assert.equal(request.agentIdHash, agentIdHash.toString('hex'));
assert.equal(request.genesisPda, expectedGenesis.toBase58());
assert.equal(request.genesisBump, expectedGenesisBump);
assert.equal(request.attestationPda, expectedAttestation.toBase58());
assert.equal(request.attestationBump, expectedAttestationBump);
assert.match(request.requestHash, /^[a-f0-9]{64}$/);
assert.equal(request.programs.identity, 'GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG');
assert.equal(request.programs.attestations, '6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD');

const deterministicA = prepareIdentityAttestationRequest({
  subjectWallet: SUBJECT_WALLET,
  agentId: 'brainChain',
  claimType: 'github_verified',
  metadataHash: METADATA_HASH,
  attester: ATTESTER,
  network: 'devnet',
});
const deterministicB = prepareIdentityAttestationRequest({
  subjectWallet: SUBJECT_WALLET,
  agentId: 'brainChain',
  claimType: 'github_verified',
  metadataHash: METADATA_HASH,
  attester: ATTESTER,
  network: 'devnet',
});

assert.deepEqual(deterministicA, deterministicB);
assert.equal(JSON.stringify(deterministicA), JSON.stringify(deterministicB));

const aliasRequest = prepareIdentityAttestationRequest({
  subjectWallet: SUBJECT_WALLET,
  attestationType: 'wallet_control_verified',
  metadataHash: METADATA_HASH.toLowerCase(),
  issuer: ATTESTER,
  network: 'mainnet',
  expiresAt: 1893456000,
});

assert.equal(aliasRequest.agentId, SUBJECT_WALLET);
assert.equal(aliasRequest.claimType, 'wallet_control_verified');
assert.equal(aliasRequest.attester, ATTESTER);
assert.equal(aliasRequest.network, 'mainnet');
assert.equal(aliasRequest.expiresAt, 1893456000);

assertThrows(/Invalid subjectWallet/, () => prepareIdentityAttestationRequest({
  subjectWallet: 'not-a-wallet',
  claimType: 'github_verified',
  metadataHash: METADATA_HASH,
}));

assertThrows(/Invalid metadataHash/, () => prepareIdentityAttestationRequest({
  subjectWallet: SUBJECT_WALLET,
  claimType: 'github_verified',
  metadataHash: 'abc',
}));

assertThrows(/Invalid claimType/, () => prepareIdentityAttestationRequest({
  subjectWallet: SUBJECT_WALLET,
  claimType: 'x'.repeat(33),
  metadataHash: METADATA_HASH,
}));

assertThrows(/Invalid network/, () => prepareIdentityAttestationRequest({
  subjectWallet: SUBJECT_WALLET,
  claimType: 'github_verified',
  metadataHash: METADATA_HASH,
  network: 'testnet',
}));

assertThrows(/Invalid expiresAt/, () => prepareIdentityAttestationRequest({
  subjectWallet: SUBJECT_WALLET,
  claimType: 'github_verified',
  metadataHash: METADATA_HASH,
  expiresAt: -1,
}));

console.log('attestation request helper OK');

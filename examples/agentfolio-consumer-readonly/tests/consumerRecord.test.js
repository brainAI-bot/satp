'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const bs58Module = require('bs58');
const profile = require('../fixtures/agentfolio-profile.json');
const {
  buildAgentFolioRuntimePreflight,
  buildAgentFolioSatpConsumerRecord,
  prepareAgentFolioWalletControlChallenge,
  verifyAgentFolioSatpConsumerRecord,
} = require('../src/consumerRecord');

const bs58 = bs58Module.default || bs58Module;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEphemeralWalletSigner() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  const wallet = bs58.encode(publicDer.subarray(-32));

  return {
    wallet,
    sign(message) {
      return crypto.sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');
    },
  };
}

function profileWithWallet(wallet) {
  const runtimeProfile = clone(profile);
  runtimeProfile.wallet = wallet;
  for (const signal of runtimeProfile.trustSignals) {
    if (signal.claimType === 'wallet_control_verified') {
      signal.subject = wallet;
    }
  }
  return runtimeProfile;
}

test('builds offline SATP trust inputs for an AgentFolio-style consumer', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });

  assert.equal(record.mode, 'offline-readonly-consumer-preflight');
  assert.equal(record.integration.agentfolioRole, 'consumer-adapter');
  assert.equal(record.integration.writesRequired, false);
  assert.equal(record.integration.signingRequired, false);
  assert.equal(record.satp.trustInputs.length, 2);

  for (const input of record.satp.trustInputs) {
    assert.equal(input.trustPacket.mode, 'offline-readonly-trust-packet');
    assert.equal(input.trustPacket.flags.signingRequired, false);
    assert.equal(input.trustPacket.flags.noTransaction, true);
    assert.equal(input.trustPacket.requestHash, input.request.requestHash);
    assert.equal(input.trustPacket.pda.attestation, input.request.attestationPda);
    assert.equal(input.request.mode, 'unsigned-readonly-request');
    assert.equal(input.request.signingRequired, false);
    assert.equal(input.request.unsigned, true);
    assert.equal(input.request.transaction, null);
    assert.deepEqual(input.request.instructions, []);
    assert.equal(input.request.subjectWallet, record.satp.subjectWallet);
    assert.equal(input.request.agentId, record.satp.agentId);
    assert.match(input.request.attestationPda, /^[1-9A-HJ-NP-Za-km-z]+$/);
  }
});

test('verifies prepared consumer records without network or signing', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  assert.deepEqual(verifyAgentFolioSatpConsumerRecord(record), { ok: true, errors: [] });
});

test('prepares wallet-control verification and identity attestation request for AgentFolio runtime use', () => {
  const signer = createEphemeralWalletSigner();
  const runtimeProfile = profileWithWallet(signer.wallet);
  const challengeRequest = prepareAgentFolioWalletControlChallenge({
    profile: runtimeProfile,
    network: 'devnet',
    nonce: 'runtime-example-nonce',
    issuedAt: 1700000000,
    expiresAt: 1700000300,
  });
  const signature = signer.sign(challengeRequest.message);
  const preflight = buildAgentFolioRuntimePreflight({
    profile: runtimeProfile,
    walletControlChallenge: challengeRequest.challenge,
    walletControlSignature: signature,
    network: 'devnet',
    now: 1700000005,
  });

  assert.equal(challengeRequest.signing.expectedWalletAdapterMethod, 'signMessage');
  assert.equal(challengeRequest.signing.keypairExportRequired, false);
  assert.equal(challengeRequest.signing.transactionRequired, false);
  assert.equal(preflight.readyForQueue, true);
  assert.equal(preflight.walletControl.verification.ok, true);
  assert.equal(preflight.identityAttestation.directHelper, 'prepareIdentityAttestationRequest');
  assert.equal(preflight.identityAttestation.request.mode, 'unsigned-readonly-request');
  assert.equal(preflight.identityAttestation.request.signingRequired, false);
  assert.equal(preflight.identityAttestation.request.unsigned, true);
  assert.equal(preflight.identityAttestation.request.transaction, null);
  assert.deepEqual(preflight.identityAttestation.request.instructions, []);
  assert.equal(preflight.identityAttestation.request.subjectWallet, signer.wallet);
  assert.equal(preflight.identityAttestation.request.claimType, 'wallet_control_verified');
  assert.equal(preflight.agentfolioConsumer.verification.ok, true);
  assert.equal(preflight.agentfolioConsumer.record.profile.wallet, signer.wallet);
  assert.equal(preflight.boundaries.npmPublishRequired, false);
  assert.equal(preflight.boundaries.solanaWriteRequired, false);
  assert.equal(preflight.boundaries.productionDeployRequired, false);
});

test('rejects tampered wallet-control signatures before runtime queueing', () => {
  const signer = createEphemeralWalletSigner();
  const runtimeProfile = profileWithWallet(signer.wallet);
  const challengeRequest = prepareAgentFolioWalletControlChallenge({
    profile: runtimeProfile,
    nonce: 'tamper-example-nonce',
    issuedAt: 1700000000,
    expiresAt: 1700000300,
  });
  const signatureBytes = Buffer.from(signer.sign(challengeRequest.message), 'base64');
  signatureBytes[0] ^= 0xff;
  const preflight = buildAgentFolioRuntimePreflight({
    profile: runtimeProfile,
    walletControlChallenge: challengeRequest.challenge,
    walletControlSignature: signatureBytes.toString('base64'),
    now: 1700000005,
  });

  assert.equal(preflight.readyForQueue, false);
  assert.equal(preflight.walletControl.verification.ok, false);
  assert.match(preflight.walletControl.verification.errors.join('\n'), /signature does not verify/);
  assert.equal(preflight.identityAttestation.request.transaction, null);
});

test('detects changed trust metadata before an app treats the record as valid', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  record.satp.trustInputs[0].metadata.subject = 'changed-subject';

  const result = verifyAgentFolioSatpConsumerRecord(record);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /metadataHash does not match metadata/);
});

test('detects tampered derived request attestation PDA', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const tampered = clone(record);
  tampered.satp.trustInputs[0].request.attestationPda = tampered.satp.trustInputs[1].request.attestationPda;

  const result = verifyAgentFolioSatpConsumerRecord(tampered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /request\.attestationPda does not match derived request/);
});

test('detects tampered derived trust packet PDA', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const tampered = clone(record);
  tampered.satp.trustInputs[0].trustPacket.pda.attestation = tampered.satp.trustInputs[1].trustPacket.pda.attestation;

  const result = verifyAgentFolioSatpConsumerRecord(tampered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /trustPacket/);
});

test('detects tampered derived request program IDs', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const tampered = clone(record);
  tampered.satp.trustInputs[0].request.programs.identity = tampered.satp.trustInputs[0].request.programs.attestations;

  const result = verifyAgentFolioSatpConsumerRecord(tampered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /request\.programs does not match derived request/);
});

test('detects tampered derived request hash', () => {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const tampered = clone(record);
  tampered.satp.trustInputs[0].request.requestHash = '0'.repeat(64);

  const result = verifyAgentFolioSatpConsumerRecord(tampered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /request\.requestHash does not match derived request/);
});

test('rejects invalid profile wallets before preparing requests', () => {
  assert.throws(
    () => buildAgentFolioSatpConsumerRecord({ profile: { ...profile, wallet: 'not-a-wallet' } }),
    /Invalid profile.wallet/
  );
});

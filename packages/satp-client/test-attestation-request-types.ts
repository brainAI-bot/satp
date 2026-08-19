import {
  IdentityAttestationRequestOptions,
  IdentityAttestationRequestVerification,
  IdentityAttestationRequestVerificationOptions,
  SatpTrustPacket,
  SatpTrustPacketValidation,
  WalletControlChallenge,
  WalletControlChallengeOptions,
  WalletControlChallengeVerification,
  buildSatpTrustPacket,
  buildWalletControlChallenge,
  canonicalWalletControlChallenge,
  verifyWalletControlChallengeSignature,
  prepareIdentityAttestationRequest,
  verifyIdentityAttestationRequest,
  validateSatpTrustPacket,
} from './src';

const subjectWallet = '11111111111111111111111111111111';
const metadataHash = 'a'.repeat(64);

const byClaimType: IdentityAttestationRequestOptions = {
  subjectWallet,
  metadataHash,
  claimType: 'github_verified',
};

const byAttestationType: IdentityAttestationRequestOptions = {
  subjectWallet,
  metadataHash,
  attestationType: 'wallet_control_verified',
};

const byBothAliases: IdentityAttestationRequestOptions = {
  subjectWallet,
  metadataHash,
  claimType: 'github_verified',
  attestationType: 'github_verified',
};

prepareIdentityAttestationRequest(byClaimType);
prepareIdentityAttestationRequest(byAttestationType);
prepareIdentityAttestationRequest(byBothAliases);

const requestVerificationOptions: IdentityAttestationRequestVerificationOptions = {
  expectedSubjectWallet: subjectWallet,
  expectedAgentId: 'brainChain',
  expectedClaimType: 'github_verified',
  expectedMetadataHash: metadataHash,
  expectedNetwork: 'devnet',
  expectedExpiresAt: null,
};
const requestVerification: IdentityAttestationRequestVerification = verifyIdentityAttestationRequest(
  prepareIdentityAttestationRequest(byClaimType),
  requestVerificationOptions,
);
void requestVerification.ok;

const packet: SatpTrustPacket = buildSatpTrustPacket(byClaimType);
const validation: SatpTrustPacketValidation = validateSatpTrustPacket(packet);
void validation.ok;

const walletChallengeOptions: WalletControlChallengeOptions = {
  agentId: 'brainChain',
  wallet: subjectWallet,
  nonce: 'type-check-nonce',
  issuedAt: 1893456000,
  expiresAt: 1893456300,
  audience: 'type-check',
};
const walletChallenge: WalletControlChallenge = buildWalletControlChallenge(walletChallengeOptions);
const walletChallengeMessage: string = canonicalWalletControlChallenge(walletChallenge);
const walletChallengeVerification: WalletControlChallengeVerification = verifyWalletControlChallengeSignature({
  challenge: walletChallenge,
  signature: new Uint8Array(64),
  expectedWallet: subjectWallet,
  expectedAgentId: 'brainChain',
  expectedAudience: 'type-check',
  usedNonces: new Set<string>(),
});
void walletChallengeMessage;
void walletChallengeVerification.ok;

// @ts-expect-error claimType or attestationType is required.
const missingAlias: IdentityAttestationRequestOptions = {
  subjectWallet,
  metadataHash,
};

// @ts-expect-error claimType or attestationType is required.
prepareIdentityAttestationRequest({
  subjectWallet,
  metadataHash,
});

void missingAlias;

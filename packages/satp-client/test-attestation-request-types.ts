import {
  IdentityAttestationRequestOptions,
  prepareIdentityAttestationRequest,
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

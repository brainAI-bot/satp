export {
  WALLET_CONTROL_CHALLENGE_SCHEMA_VERSION,
  WALLET_CONTROL_CHALLENGE_TYPE,
  DEFAULT_WALLET_CONTROL_DOMAIN,
  DEFAULT_WALLET_CONTROL_AUDIENCE,
  buildWalletControlChallenge,
  canonicalWalletControlChallenge,
  hashWalletControlChallenge,
  deriveWalletControlChallengePdas,
  verifyWalletControlChallengeSignature,
} from '@brainai/satp-client';

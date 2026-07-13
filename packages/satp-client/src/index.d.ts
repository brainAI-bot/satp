import { PublicKey, Transaction, Connection } from '@solana/web3.js';

export type Network = 'mainnet' | 'devnet';

export type IdentityAttestationTypeOption =
  | { claimType: string; attestationType?: string }
  | { claimType?: string; attestationType: string };

export type IdentityAttestationRequestOptions = {
  subjectWallet: PublicKey | string;
  agentId?: string;
  metadataHash: string;
  attester?: PublicKey | string;
  issuer?: PublicKey | string;
  network?: Network;
  expiresAt?: number | null;
} & IdentityAttestationTypeOption;

export interface IdentityAttestationRequest {
  schemaVersion: 'satp.identityAttestationRequest.v1';
  requestType: 'identity-attestation';
  mode: 'unsigned-readonly-request';
  network: Network;
  signingRequired: false;
  unsigned: true;
  subjectWallet: string;
  agentId: string;
  attester: string;
  claimType: string;
  attestationType: string;
  metadataHash: string;
  proofData: string;
  expiresAt: number | null;
  agentIdHash: string;
  genesisPda: string;
  genesisBump: number;
  attestationPda: string;
  attestationBump: number;
  programs: {
    identity: string;
    attestations: string;
  };
  instructions: [];
  signers: [];
  transaction: null;
  requestHash: string;
}

export interface SatpTrustPacket {
  schemaVersion: 'satp.trustPacket.v1';
  packetType: 'satp-trust-packet';
  mode: 'offline-readonly-trust-packet';
  network: Network;
  subjectWallet: string;
  agentId: string;
  claimType: string;
  attestationType: string;
  metadataHash: string;
  attester: string;
  expiresAt: number | null;
  programs: {
    identity: string;
    attestations: string;
  };
  pda: {
    genesis: string;
    genesisBump: number;
    attestation: string;
    attestationBump: number;
  };
  requestHash: string;
  flags: {
    signingRequired: false;
    transactionRequired: false;
    writesRequired: false;
    livePaymentRequired: false;
    unsigned: true;
    noSign: true;
    noTransaction: true;
  };
  instructions: [];
  signers: [];
  transaction: null;
  request: IdentityAttestationRequest;
}

export interface SatpTrustPacketValidation {
  ok: boolean;
  errors: string[];
}

export interface X402PaymentRequirement {
  scheme?: string;
  network?: string;
  asset?: string;
  payTo?: string;
  maxAmountRequired?: string | number;
  amountRequired?: string | number;
  resource?: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  extra?: unknown;
}

export interface X402DiscoveryMetadata {
  schemaVersion: 'satp.x402DiscoveryMetadata.v1';
  protocol: 'x402';
  resource: string | null;
  endpoint: string | null;
  action: string | null;
  paymentRequired: boolean;
  paymentRequirements: X402PaymentRequirement[];
  guardrail: 'X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION';
}

export interface X402EvidenceLookup {
  type: 'x402';
  endpoint: string | null;
  maxCostUsd: number | null;
  protocol: 'x402';
  source: {
    kind: string;
    url: string | null;
  };
  resource: string | null;
  paymentRequired: boolean;
  paymentRequirements: X402PaymentRequirement[];
  discovery: X402DiscoveryMetadata;
  guardrail: 'X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION';
  paymentAuthorization: false;
  actionAuthorization: false;
  spendAuthorized: false;
  livePaymentRequired: false;
}

export type RuntimePolicyDecision =
  | 'allow'
  | 'deny'
  | 'degrade'
  | 'needs_approval';

export interface RuntimePolicyIdentityPayload {
  active?: boolean;
  satpVerified?: boolean;
  verified?: boolean;
  agentFolioTrustScore?: number;
  trustScore?: number;
  capabilities?: string[];
  evidenceUpdatedAt?: string | number | Date | null;
}

export interface RuntimePolicyActionDescriptor {
  schemaVersion?: string;
  surface?: string;
  type?: string;
  resource?: string;
  operation?: string;
  capability?: string;
  requiresCapability?: string;
  minimumTrustScore?: number;
  trustScoreMinimum?: number;
  allowDegraded?: boolean;
  requiresFreshEvidence?: boolean;
  costUsd?: number;
  protectedTool?: boolean;
  operatorApprovalRequired?: boolean;
  evidenceLookup?: {
    type?: string;
    endpoint?: string;
    maxCostUsd?: number;
  } | X402EvidenceLookup;
}

export interface RuntimePolicyActionDescriptorBuildInput extends RuntimePolicyActionDescriptor {
  profileId?: string;
}

export interface RuntimePolicyHostActionDescriptor extends RuntimePolicyActionDescriptor {
  schemaVersion: 'satp.runtimePolicyHostActionDescriptor.v1';
  type: string;
  resource: string | null;
  operation: string | null;
  requiresCapability: string | null;
  minimumTrustScore: number | null;
  allowDegraded: boolean;
  requiresFreshEvidence: boolean;
  costUsd: number;
  protectedTool: boolean;
  operatorApprovalRequired: boolean;
  guardrails: {
    localDecisionOnly: true;
    writesSolanaState: false;
    usesKeypairs: false;
    deploysPrograms: false;
    publishesPackages: false;
    livePaymentRequired: false;
  };
}

export interface RuntimePolicyConfig {
  minimumTrustScore?: number;
  denyTrustScoreBelow?: number;
  maxAutoSpendUsd?: number;
  requireVerifiedIdentity?: boolean;
  staleEvidenceAfterMs?: number;
}

export interface RuntimePolicyOptions {
  now?: string | number | Date;
  actionPaymentPreapproved?: boolean;
  evidenceLookupPaymentPreapproved?: boolean;
  operatorApproved?: boolean;
  policy?: RuntimePolicyConfig;
}

export interface RuntimePolicyAdapterOptions {
  policy?: RuntimePolicyConfig;
  now?: string | number | Date | (() => string | number | Date);
  redact?: (value: string) => string;
  defaultActionType?: string;
}

export interface RuntimePolicyResult {
  decision: RuntimePolicyDecision;
  reasonCodes: string[];
  message: string;
  checks: Record<string, unknown>;
}

export interface RuntimePolicyAuditTrace {
  schemaVersion: 'satp.runtimePolicyAuditTrace.v1';
  mode: 'offline-local-runtime-policy-trace';
  generatedAt: string;
  decision: RuntimePolicyDecision;
  reasonCodes: string[];
  message: string;
  subject: {
    agentId: string | null;
    active: boolean;
    verified: boolean;
    trustScoreBand: '90-100' | '80-89' | '70-79' | '50-69' | '25-49' | '0-24';
    evidenceUpdatedAt: string | number | Date | null;
    capabilityCount: number;
  };
  action: {
    type: string;
    operation: string | null;
    resourceKind: string | null;
    resourceLabel: string | null;
    requiresCapability: string | null;
    requiresFreshEvidence: boolean;
    protectedTool: boolean;
    operatorApprovalRequired: boolean;
    costUsd: number | null;
    evidenceLookup: {
      type: string | null;
      configured: true;
      maxCostUsd: number | null;
    } | null;
  };
  checks: Record<string, unknown>;
  guardrails: {
    localDecisionOnly: true;
    writesSolanaState: false;
    usesKeypairs: false;
    deploysPrograms: false;
    publishesPackages: false;
    authorizesPayment: false;
    authorizesAgentActionFromPayment: false;
  };
}

export interface RuntimePolicyAdapter {
  action(
    input?: RuntimePolicyActionDescriptorBuildInput | string,
    overrides?: RuntimePolicyActionDescriptorBuildInput
  ): RuntimePolicyHostActionDescriptor;
  evaluate(
    identityPayload: RuntimePolicyIdentityPayload,
    actionDescriptor: RuntimePolicyActionDescriptor,
    options?: RuntimePolicyOptions
  ): RuntimePolicyResult;
  auditTrace(
    identityPayload: RuntimePolicyIdentityPayload,
    actionDescriptor: RuntimePolicyActionDescriptor,
    options?: RuntimePolicyOptions & { result?: RuntimePolicyResult }
  ): RuntimePolicyAuditTrace;
  explain(result: RuntimePolicyResult): string[];
}

export type SatpSignerRole = 'operational_signer' | 'owner_upgrade_authority';

export type SatpOperationalSignerAction =
  | 'devnet_fee_payment'
  | 'devnet_transaction_submission'
  | 'offline_transaction_preparation'
  | 'read_only_rpc';

export type SatpOwnerGatedAction =
  | 'program_upgrade'
  | 'authority_transfer'
  | 'key_generation'
  | 'key_rotation'
  | 'mainnet_deploy'
  | 'devnet_deploy'
  | 'npm_publish'
  | 'funds_custody'
  | 'funds_transfer';

export interface SignerSeparationOptions {
  network?: Network;
  operationalSignerPublicKey: PublicKey | string;
  ownerUpgradeAuthorityPublicKey: PublicKey | string;
  operationalAllowedActions?: SatpOperationalSignerAction[];
}

export interface SignerSeparationConfig {
  schemaVersion: 'satp.signerSeparation.v1';
  network: Network;
  operationalSigner: {
    role: 'operational_signer';
    publicKey: string;
    allowedActions: SatpOperationalSignerAction[];
    blockedActions: SatpOwnerGatedAction[];
    authorityBoundary: 'no_upgrade_authority_no_key_management_no_funds_custody';
  };
  ownerUpgradeAuthority: {
    role: 'owner_upgrade_authority';
    publicKey: string;
    custody: 'owner_held';
    operationalSignerMayUse: false;
  };
  flags: {
    publicKeysOnly: true;
    readsKeypairs: false;
    generatesKeypairs: false;
    transfersAuthority: false;
    deploysPrograms: false;
    publishesPackages: false;
    writesSolanaState: false;
  };
}

export interface SignerSeparationValidation {
  ok: boolean;
  errors: string[];
  normalized: SignerSeparationConfig | null;
}

export const DECISIONS: Readonly<{
  ALLOW: 'allow';
  DENY: 'deny';
  DEGRADE: 'degrade';
  NEEDS_APPROVAL: 'needs_approval';
}>;

export const REASON_CODES: Readonly<Record<string, string>>;
export const RUNTIME_POLICY_AUDIT_TRACE_SCHEMA_VERSION: 'satp.runtimePolicyAuditTrace.v1';
export const RUNTIME_POLICY_HOST_ACTION_DESCRIPTOR_SCHEMA_VERSION: 'satp.runtimePolicyHostActionDescriptor.v1';
export const DEFAULT_POLICY: Readonly<Required<RuntimePolicyConfig>>;

export const SATP_SIGNER_ROLES: Readonly<{
  OPERATIONAL_SIGNER: 'operational_signer';
  OWNER_UPGRADE_AUTHORITY: 'owner_upgrade_authority';
}>;

export const OPERATIONAL_SIGNER_ALLOWED_ACTIONS: Readonly<SatpOperationalSignerAction[]>;
export const OWNER_UPGRADE_AUTHORITY_BLOCKED_ACTIONS: Readonly<SatpOwnerGatedAction[]>;

export function buildSignerSeparationConfig(
  opts: SignerSeparationOptions
): SignerSeparationConfig;

export function validateSignerSeparationConfig(
  config: SignerSeparationConfig | Record<string, unknown> | null | undefined
): SignerSeparationValidation;

export function evaluateRuntimePolicy(
  identityPayload: RuntimePolicyIdentityPayload,
  actionDescriptor: RuntimePolicyActionDescriptor,
  options?: RuntimePolicyOptions
): RuntimePolicyResult;

export function buildRuntimePolicyActionDescriptor(
  input?: RuntimePolicyActionDescriptorBuildInput | string,
  overrides?: RuntimePolicyActionDescriptorBuildInput
): RuntimePolicyHostActionDescriptor;

export function buildRuntimePolicyAuditTrace(
  identityPayload: RuntimePolicyIdentityPayload,
  actionDescriptor: RuntimePolicyActionDescriptor,
  options?: RuntimePolicyOptions & { result?: RuntimePolicyResult }
): RuntimePolicyAuditTrace;

export function createRuntimePolicyAdapter(
  options?: RuntimePolicyAdapterOptions
): RuntimePolicyAdapter;

export interface WalletControlChallengeOptions {
  agentId: string;
  wallet: PublicKey | string;
  network?: Network;
  domain?: string;
  audience?: string;
  nonce?: string;
  issuedAt?: number;
  expiresAt?: number;
}

export interface WalletControlChallenge {
  schemaVersion: 'satp.walletControlChallenge.v1';
  challengeType: 'wallet-control';
  domain: string;
  audience: string;
  network: Network;
  agentId: string;
  wallet: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  agentIdHash: string;
  genesisPda: string;
  genesisBump: number;
  linkedWalletPda: string;
  linkedWalletBump: number;
}

export interface WalletControlChallengePdas {
  agentIdHash: string;
  genesisPda: string;
  genesisBump: number;
  linkedWalletPda: string;
  linkedWalletBump: number;
}

export interface VerifyWalletControlChallengeSignatureOptions {
  challenge: WalletControlChallenge | Record<string, unknown>;
  signature: string | Buffer | Uint8Array | number[];
  expectedWallet?: PublicKey | string;
  expectedAgentId?: string;
  expectedDomain?: string;
  expectedAudience?: string;
  now?: number;
  usedNonces?: Set<string> | string[] | Record<string, boolean>;
  replayCache?: { has(nonce: string): boolean } | string[] | Record<string, boolean>;
  isNonceUsed?: (nonce: string, challenge: WalletControlChallenge) => boolean;
}

export interface WalletControlChallengeVerification {
  ok: boolean;
  errors: string[];
  challengeHash: string;
}

// ─── V2 SDK ──────────────────────────────────────────────

export interface V2ProgramIds {
  IDENTITY: PublicKey;
  REPUTATION: PublicKey;
  VALIDATION: PublicKey;
  REVIEWS: PublicKey;
  ESCROW: PublicKey | null;
}

export interface SATSDKOptions {
  network?: Network;
  rpcUrl?: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  allowLegacyV2Mainnet?: boolean;
}

export interface V2Identity {
  owner: string;
  agentName: string;
  metadata: string;
  createdAt: number;
  updatedAt: number;
  pda: string;
  reputationScore?: number;
  verificationLevel?: number;
}

export interface V2EscrowState {
  client: string;
  agent: string;
  amount: number;
  descriptionHash: string;
  deadline: number;
  status: string;
  createdAt: number;
  bump: number;
  workHash: string | null;
  pda: string;
}

export interface V2ReviewState {
  reviewer: string;
  reviewed: string;
  jobId: number;
  jobRef: string;
  rating: number;
  categoryQuality: number;
  categoryReliability: number;
  categoryCommunication: number;
  commentUri: string;
  commentHash: string;
  timestamp: number;
  hasResponse: boolean;
  responseUri: string | null;
  responseHash: string | null;
  responseTimestamp: number | null;
  bump: number;
  pda: string;
}

export class SATPSDK {
  network: Network;
  rpcUrl: string;
  commitment: string;
  connection: Connection;
  programIds: V2ProgramIds;

  constructor(opts?: SATSDKOptions);

  // Identity
  buildCreateIdentity(wallet: PublicKey | string, agentName: string, metadata: string | object): Promise<{ transaction: Transaction; identityPDA: PublicKey }>;
  createIdentity(signer: any, agentName: string, metadata: string | object): Promise<string>;
  getIdentity(wallet: PublicKey | string): Promise<V2Identity | null>;

  // Reputation
  buildRecomputeReputation(agentWallet: PublicKey | string, payer: PublicKey | string): Promise<{ transaction: Transaction }>;
  recomputeReputation(signerKeypair: any, agentWallet: PublicKey | string): Promise<string>;
  getReputation(wallet: PublicKey | string): Promise<{ owner: string; agentName: string; reputationScore: number; verificationLevel: number; pda: string } | null>;

  // Validation
  buildRecomputeLevel(agentWallet: PublicKey | string, payer: PublicKey | string): Promise<{ transaction: Transaction }>;
  recomputeLevel(signerKeypair: any, agentWallet: PublicKey | string): Promise<string>;

  // MintTracker
  buildInitMintTracker(wallet: PublicKey | string): Promise<{ transaction: Transaction; mintTrackerPDA: PublicKey }>;

  // Escrow
  buildCreateEscrow(clientWallet: PublicKey | string, agentWallet: PublicKey | string, amountLamports: number, description: string, deadlineUnix: number): Promise<{ transaction: Transaction; escrowPDA: PublicKey; descriptionHash: Buffer }>;
  buildRelease(clientWallet: PublicKey | string, agentWallet: PublicKey | string, escrowPDA: PublicKey | string): Promise<{ transaction: Transaction }>;
  buildSubmitWork(agentWallet: PublicKey | string, escrowPDA: PublicKey | string, workProof: string): Promise<{ transaction: Transaction; workHash: Buffer }>;
  buildCancel(clientWallet: PublicKey | string, escrowPDA: PublicKey | string): Promise<{ transaction: Transaction }>;
  buildRaiseDispute(signerWallet: PublicKey | string, escrowPDA: PublicKey | string): Promise<{ transaction: Transaction }>;
  buildCloseEscrow(clientWallet: PublicKey | string, escrowPDA: PublicKey | string): Promise<{ transaction: Transaction }>;
  buildResolveDispute(clientWallet: PublicKey | string, agentWallet: PublicKey | string, escrowPDA: PublicKey | string, releaseToAgent: boolean): Promise<{ transaction: Transaction }>;
  getEscrow(escrowPDA: PublicKey | string): Promise<V2EscrowState | null>;

  // Reviews V3 (job-scoped)
  buildSubmitReview(reviewerWallet: PublicKey | string, reviewerIdentityPDA: PublicKey | string, jobPDA: PublicKey | string, ratings: { rating: number; quality: number; reliability: number; communication: number }, commentUri: string, commentHash: Buffer | string): Promise<{ transaction: Transaction; reviewPDA: PublicKey }>;
  buildRespondToReview(responderWallet: PublicKey | string, reviewPDA: PublicKey | string, responseUri: string, responseHash: Buffer | string): Promise<{ transaction: Transaction }>;
  getReview(reviewPDA: PublicKey | string): Promise<V2ReviewState | null>;
  getReviewV3PDA(jobPDA: PublicKey | string, reviewer: PublicKey | string): [PublicKey, number];

  // Verification
  verifyAgent(wallet: PublicKey | string): Promise<boolean>;

  // Utility
  getPDAs(wallet: PublicKey | string): { identity: string; reviewCounter: string; mintTracker: string; reputationAuthority: string; validationAuthority: string };
}

// ─── V3 SDK ──────────────────────────────────────────────

export { SATPV3SDK } from './v3-sdk';

// ─── V2 PDA Helpers ─────────────────────────────────────

export function getProgramIds(network?: Network): V2ProgramIds;
export function getIdentityPDA(wallet: PublicKey, network?: Network): [PublicKey, number];
export function getReputationAuthorityPDA(network?: Network): [PublicKey, number];
export function getValidationAuthorityPDA(network?: Network): [PublicKey, number];
export function getReviewCounterPDA(wallet: PublicKey, network?: Network): [PublicKey, number];
export function getMintTrackerPDA(identityPDA: PublicKey, network?: Network): [PublicKey, number];
export function getReviewsAuthorityPDA(network?: Network): [PublicKey, number];
export function getReviewPDA(reviewCounter: PublicKey, network?: Network): [PublicKey, number];
export function getReviewAttestationPDA(reviewPDA: PublicKey, attester: PublicKey, network?: Network): [PublicKey, number];
export function getEscrowPDA(client: PublicKey, descriptionHash: Buffer, network?: Network): [PublicKey, number];
export function getReviewV3PDA(jobPDA: PublicKey | string, reviewer: PublicKey | string, network?: Network): [PublicKey, number];
export function anchorDiscriminator(ixName: string): Buffer;

// ─── V3 PDA Helpers ─────────────────────────────────────

export {
  getV3ProgramIds,
  hashAgentId,
  hashName,
  getGenesisPDA,
  getV3ReputationAuthorityPDA,
  getV3ValidationAuthorityPDA,
  getV3MintTrackerPDA,
  getNameRegistryPDA,
  getLinkedWalletPDA,
  getV3ReviewPDA,
  getV3ReviewCounterPDA,
  getV3AttestationPDA,
  getV3EscrowPDA,
  getAssociatedTokenAddress,
  getV3EscrowVaultATA,
  V3_DEVNET_TOKEN_MINTS,
  SPL_TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from './v3-pda';

export function prepareIdentityAttestationRequest(
  opts: IdentityAttestationRequestOptions
): IdentityAttestationRequest;

export const TRUST_PACKET_SCHEMA_VERSION: 'satp.trustPacket.v1';

export function buildSatpTrustPacket(
  opts: IdentityAttestationRequestOptions
): SatpTrustPacket;

export function validateSatpTrustPacket(
  packet: SatpTrustPacket | Record<string, unknown> | null | undefined
): SatpTrustPacketValidation;

export const X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION: 'X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION';
export const X402_DISCOVERY_SCHEMA_VERSION: 'satp.x402DiscoveryMetadata.v1';
export const RUNTIME_POLICY_ACTION_DESCRIPTOR_SCHEMA_VERSION: 'satp.runtimePolicyActionDescriptor.v1';

export function parseX402DiscoveryMetadata(
  input: Record<string, unknown> | string
): X402DiscoveryMetadata;

export function buildX402EvidenceLookup(
  input: Record<string, unknown> | string,
  opts?: {
    endpoint?: string;
    maxCostUsd?: number;
    sourceKind?: string;
    sourceUrl?: string;
  }
): X402EvidenceLookup;

export function buildRuntimePolicyActionDescriptorFromX402Discovery(
  input: Record<string, unknown> | string,
  opts?: {
    type?: string;
    resource?: string;
    operation?: string;
    requiresFreshEvidence?: boolean;
    endpoint?: string;
    maxCostUsd?: number;
    sourceKind?: string;
    sourceUrl?: string;
  }
): RuntimePolicyActionDescriptor & {
  schemaVersion: 'satp.runtimePolicyActionDescriptor.v1';
  evidenceLookup: X402EvidenceLookup;
  paymentAuthorization: false;
  actionAuthorization: false;
  spendAuthorized: false;
  livePaymentRequired: false;
  guardrail: 'X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION';
};

export const buildRuntimePolicyActionDescriptorFromX402: typeof buildRuntimePolicyActionDescriptorFromX402Discovery;

export const WALLET_CONTROL_CHALLENGE_SCHEMA_VERSION: 'satp.walletControlChallenge.v1';
export const WALLET_CONTROL_CHALLENGE_TYPE: 'wallet-control';
export const DEFAULT_WALLET_CONTROL_DOMAIN: string;
export const DEFAULT_WALLET_CONTROL_AUDIENCE: string;

export function buildWalletControlChallenge(
  opts: WalletControlChallengeOptions
): WalletControlChallenge;

export function canonicalWalletControlChallenge(
  challenge: WalletControlChallenge | Record<string, unknown>
): string;

export function hashWalletControlChallenge(
  challenge: WalletControlChallenge | Record<string, unknown>
): string;

export function deriveWalletControlChallengePdas(
  opts: Pick<WalletControlChallengeOptions, 'agentId' | 'wallet' | 'network'>
): WalletControlChallengePdas;

export function verifyWalletControlChallengeSignature(
  opts: VerifyWalletControlChallengeSignatureOptions
): WalletControlChallengeVerification;

// ─── Borsh Deserialization Helpers ──────────────────────

export {
  BorshReader,
  deserializeGenesisRecord,
  deserializeLinkedWallet,
  deserializeMintTracker,
  deserializeNameRegistry,
  deserializeReview,
  deserializeReviewCounter,
  deserializeAttestation,
  deserializeEscrowV3,
  deserializeAccount,
  deserializeBatch,
  getAccountDiscriminator,
  accountDiscriminator,
  isAccountType,
  DISCRIMINATORS,
  ParsedGenesisRecord,
  ParsedLinkedWallet,
  ParsedMintTracker,
  ParsedNameRegistry,
  ParsedReview,
  ParsedReviewCounter,
  ParsedAttestation,
  ParsedEscrowV3,
  AccountTypeName,
  ParsedAccountData,
} from './borsh-reader';

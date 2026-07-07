import { PublicKey } from '@solana/web3.js';

export type Network = 'mainnet' | 'devnet';

export interface V3ProgramIds {
  IDENTITY: PublicKey;
  REVIEWS: PublicKey;
  REPUTATION: PublicKey;
  ATTESTATIONS: PublicKey;
  VALIDATION: PublicKey;
  ESCROW: PublicKey;
}

export const TOKEN_PROGRAM_ID: PublicKey;
export const ASSOCIATED_TOKEN_PROGRAM_ID: PublicKey;

/** Get all V3 program IDs for a network. */
export function getV3ProgramIds(network?: Network): V3ProgramIds;

/** SHA-256 hash of agent ID string. Returns 32-byte Buffer. */
export function hashAgentId(agentId: string): Buffer;

/** SHA-256 hash of lowercased name string. Returns 32-byte Buffer. */
export function hashName(name: string): Buffer;

/** Derive Genesis PDA from agent ID hash. */
export function getGenesisPDA(agentIdHash: string | Buffer, network?: Network): [PublicKey, number];

/** Derive Reputation V3 Authority PDA. */
export function getV3ReputationAuthorityPDA(network?: Network): [PublicKey, number];

/** Derive Validation V3 Authority PDA. */
export function getV3ValidationAuthorityPDA(network?: Network): [PublicKey, number];

/** Derive MintTracker PDA from Genesis PDA. */
export function getV3MintTrackerPDA(genesisPDA: PublicKey | string, network?: Network): [PublicKey, number];

/** Derive NameRegistry PDA from name hash. */
export function getNameRegistryPDA(nameHash: string | Buffer, network?: Network): [PublicKey, number];

/** Derive LinkedWallet PDA from Genesis PDA and wallet. */
export function getLinkedWalletPDA(
  genesisPDA: PublicKey | string,
  wallet: PublicKey | string,
  network?: Network
): [PublicKey, number];

/** Derive Review V3 PDA from job account and reviewer. */
export function getV3ReviewPDA(
  jobPDA: PublicKey | string,
  reviewer: PublicKey | string,
  network?: Network
): [PublicKey, number];

/** Derive Attestation PDA from agent ID hash, attester, and type. */
export function getV3AttestationPDA(
  agentIdHash: string | Buffer,
  attester: PublicKey | string,
  attestationType: string,
  network?: Network
): [PublicKey, number];

/** Derive Review Counter PDA from agent ID. */
export function getV3ReviewCounterPDA(
  agentIdOrHash: string | Buffer,
  network?: Network
): [PublicKey, number];

/** Derive Escrow V3 PDA from client, description hash, and nonce. */
export function getV3EscrowPDA(
  client: PublicKey | string,
  descriptionHash: Buffer,
  nonce: number | bigint,
  network?: Network
): [PublicKey, number];

/** Derive an associated token account PDA. */
export function getAssociatedTokenPDA(
  owner: PublicKey | string,
  mint: PublicKey | string,
  allowOwnerOffCurve?: boolean,
  tokenProgramId?: PublicKey | string
): [PublicKey, number];

/** Derive the escrow-owned SPL token vault ATA for a V3 escrow PDA. */
export function getV3EscrowTokenVaultPDA(
  client: PublicKey | string,
  descriptionHash: Buffer,
  nonce: number | bigint,
  mint: PublicKey | string,
  network?: Network,
  tokenProgramId?: PublicKey | string
): [PublicKey, number, PublicKey];

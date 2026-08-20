# SATP V3 SDK - `@brainai/satp-client`

**Solana Agent Trust Protocol** - JavaScript/TypeScript SDK for reading and
building reviewed SATP V3 program interactions.

Current stable npm package: **@brainai/satp-client@2.0.6** | unpublished source candidate: **@brainai/satp-client@2.0.7** | rc dist-tag: **@brainai/satp-client@2.0.2** | Programs: **6**

## Installation

Choose stable, rc, or Git based on what the consumer needs to prove:

| Channel | Use when | Command |
| --- | --- | --- |
| Stable npm | Default production-style consumption of the stable public package. | `npm install @brainai/satp-client@2.0.6` |
| Historical rc exact version | Explicit HQ-assigned reproduction or lockfile evidence for the historical pre-stable artifact. | `npm install @brainai/satp-client@2.0.2` |
| Release candidate tag | Explicit HQ-assigned rc validation where a moving dist-tag is acceptable and the task names the tag as the target. | `npm install @brainai/satp-client@rc` |
| Reviewed Git commit | PR coordination or source-review installs tied to an exact SATP commit. | `npm install git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>` |

Registry readback on 2026-08-20 shows npm `latest` resolves to
`@brainai/satp-client@2.0.6` and the `rc` dist-tag resolves to `2.0.2`.
Stable consumers should use `latest`/`2.0.6` unless HQ assigns an explicit
release-candidate validation task.

Registry publish/readback on 2026-08-02 confirms `2.0.6` is the stable npm
package. This documentation update does not publish the package or move any npm
dist-tag.

Source release-prep on 2026-08-20 advances package metadata to `2.0.7` as the
next unpublished patch candidate containing the packed-consumer UUID advisory
remediation merged in PR #145. This source candidate is not published and does
not change the stable or `rc` registry tags.

For stable consumer installs, pin the current published npm package:

```bash
npm install @brainai/satp-client@2.0.6
```

For rc validation:

```bash
npm install @brainai/satp-client@2.0.2
```

Use `@rc` only when the HQ task names the moving tag itself as the validation
target:

```bash
npm install @brainai/satp-client@rc
```

For branch-only development or PR review, pin an explicit SATP Git commit:

```bash
npm install git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>
```

The old `0.0.0-extraction` label was extraction-branch metadata and is not the
current consumer package. Do not treat branch-only Git installs as npm latest.
Continue to [Quick Start](#quick-start) for an installed-package flow that uses
only files shipped in the package.

The consumer-root `node` commands below use the stable npm package layout. For
the reviewed Git-commit channel, insert `packages/satp-client/` after
`node_modules/@brainai/satp-client/` because that channel installs the repository
root package rather than the standalone npm artifact.

Mainnet program IDs are present for the reviewed V3 registry, but availability
is not action approval. Mainnet writes, deploys, keypair use, authority changes,
value-bearing escrow actions, npm promotion, and production claims still require
a separate HQ approval and the relevant owner-gated runbook. See the
[public authority decision packet](https://github.com/brainAI-bot/satp/blob/main/docs/mainnet-authority-decision-packet-6c8a5545.md).

Legacy `SATPSDK` is V2-only compatibility. It defaults to devnet and rejects
`network: 'mainnet'` unless `allowLegacyV2Mainnet: true` is passed explicitly.
New integrations should prefer `SATPV3SDK` or `createSATPClient`.

RC-S6 semantic uncertainty outcomes are covered by the offline conformance gate
merged in `93db1b3` (PR #53, `[#43394290]`) and runnable with
`npm run test:conformance:rc-s6` from the repository root. Treat positive
fixtures as deterministic SDK/schema compatibility only. Treat stale, revoked,
malformed, unsupported-issuer, score-meaning, review-weight, escrow-reference,
and AgentFolio copy-boundary fixtures as warning or fail-closed outcomes; do
not convert them into verified badges, ranking, eligibility, payment state,
escrow readiness, mainnet readiness, npm latest adoption, or product approval.

**Runtime dependency:** `@solana/web3.js ^1.98.4`

## Quick Start

This installed-package quickstart covers an offline read-only SDK flow.

For copy-paste MCP, A2A/agent-runtime, and x402 paid-endpoint examples, see the
packed [`examples/adoption-quickstarts.js`](examples/adoption-quickstarts.js)
or run this command from the consumer project root after installation:

```bash
node node_modules/@brainai/satp-client/examples/adoption-quickstarts.js
```

```javascript
const { SATPV3SDK } = require('@brainai/satp-client');

// Initialize (devnet by default)
const sdk = new SATPV3SDK({ network: 'devnet' });

// Check if an agent has an identity
const exists = await sdk.hasIdentity('brainChain');
console.log(exists); // true

// Read a Genesis Record
const record = await sdk.getGenesisRecord('brainChain');
console.log(record.agentName, record.category, record.isActive);

// Build a transaction (unsigned — sign with your wallet)
const tx = await sdk.buildCreateIdentity(creatorPubkey, 'myAgent', {
  agentName: 'My Agent',
  description: 'An AI agent on Solana',
  category: 'assistant',
  capabilities: ['chat', 'code'],
  metadataUri: 'https://example.com/meta.json',
});
// Sign and send tx with your wallet...
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SATP V3 SDK                              │
├─────────────┬──────────────┬──────────────┬─────────────────────┤
│ Identity    │ Reviews      │ Attestations │ Escrow              │
│ (20 methods)│ (7 methods)  │ (3 methods)  │ (10 methods)        │
├─────────────┼──────────────┼──────────────┤                     │
│ Reputation  │ Validation   │ Migration    │                     │
│ (1 method)  │ (1 method)   │ (1 method)   │                     │
├─────────────┴──────────────┴──────────────┴─────────────────────┤
│ PDA Derivation  │  Borsh Serialization  │  RPC Helpers          │
└─────────────────┴───────────────────────┴───────────────────────┘
```

## Programs & Program IDs

| Program | Mainnet | Description |
|---------|--------|-------------|
| `identity_v3` | `GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG` | Agent identity, names, wallets, face/birth |
| `reviews_v3` | `r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4` | Peer reviews with 1-5 star ratings |
| `attestations_v3` | `6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD` | Third-party attestations & proofs |
| `reputation_v3` | `2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ` | Weighted reputation scoring (CPI → identity) |
| `validation_v3` | `6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV` | Validation level computation (CPI → identity) |
| `escrow_v3` | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` | SOL escrow for agent jobs |

## API Reference

### Read-only Trust Packet Helpers

`buildSatpTrustPacket(opts)` creates a deterministic, offline trust packet for
consumer preflight and release-packet review. It uses the same inputs as
`prepareIdentityAttestationRequest`, then includes the derived program IDs,
Genesis PDA, attestation PDA, request hash, and the unsigned request object.
The packet is intentionally read-only: `flags.signingRequired`,
`flags.transactionRequired`, `flags.writesRequired`, and
`flags.livePaymentRequired` are all `false`; `instructions` and `signers`
are empty; and `transaction` is `null`.

```javascript
const {
  buildSatpTrustPacket,
  validateSatpTrustPacket,
} = require('@brainai/satp-client');

const trustPacket = buildSatpTrustPacket({
  subjectWallet: '11111111111111111111111111111111',
  agentId: 'brainChain',
  claimType: 'identity',
  metadataHash: '93d122f8879fe87c186c10a00db8fbc80a73cecd2ede44b9ffa6410be3c2b805',
  network: 'devnet',
});

const validation = validateSatpTrustPacket(trustPacket);
if (!validation.ok) throw new Error(validation.errors.join('; '));
```

`validateSatpTrustPacket(packet)` returns `{ ok, errors }`. Validation requires
`packetType: 'satp-trust-packet'` and
`mode: 'offline-readonly-trust-packet'`, rejects changed read-only flags, and
re-derives the expected packet so tampered PDA, program, request, or hash fields
surface as explicit errors.

`verifyIdentityAttestationRequest(request, expectations)` validates a standalone
unsigned request before a consumer stores or displays it. It recomputes the
canonical request hash, program IDs, agent ID hash, Genesis PDA, and attestation
PDA, and enforces the no-sign/no-transaction request shape. Optional expectations
bind the request to host-owned inputs without requiring RPC or a signer:

```javascript
const {
  prepareIdentityAttestationRequest,
  verifyIdentityAttestationRequest,
} = require('@brainai/satp-client');

const request = prepareIdentityAttestationRequest({
  subjectWallet: '11111111111111111111111111111111',
  agentId: 'brainChain',
  claimType: 'identity',
  metadataHash: '93d122f8879fe87c186c10a00db8fbc80a73cecd2ede44b9ffa6410be3c2b805',
  network: 'devnet',
});

const verification = verifyIdentityAttestationRequest(request, {
  expectedSubjectWallet: '11111111111111111111111111111111',
  expectedAgentId: 'brainChain',
  expectedClaimType: 'identity',
  expectedNetwork: 'devnet',
});

if (!verification.ok) throw new Error(verification.errors.join('; '));
```

The result shape is `{ ok, errors, warnings }`. Verification is local and
read-only; it does not prove that an attester signed or submitted anything.

### x402 Discovery Evidence Lookup Helpers

`parseX402DiscoveryMetadata(input)`, `buildX402EvidenceLookup(input, opts)`,
and `buildRuntimePolicyActionDescriptorFromX402Discovery(input, opts)` map x402
discovery metadata into SATP runtime policy evidence lookup data. The helpers are
read-only: x402 payment metadata can identify where evidence may be fetched, but
it is discovery/evidence lookup only and never authorizes SATP action execution,
spending, live payment, signing, transactions, or host policy bypass.

Run the packed
[`examples/x402-discovery-evidence-lookup.js`](./examples/x402-discovery-evidence-lookup.js)
from the consumer project root:

```bash
node node_modules/@brainai/satp-client/examples/x402-discovery-evidence-lookup.js
```

The example parses discovery metadata, builds an evidence lookup descriptor, and
builds a runtime policy action descriptor. It asserts
`X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION` plus
`paymentAuthorization: false`, `actionAuthorization: false`,
`spendAuthorized: false`, and `livePaymentRequired: false`.

The proposed issue #14 Track C endpoint spec for third-party SATP reputation
and evidence consumers lives in the
[source repository](https://github.com/brainAI-bot/satp/blob/main/docs/x402-reputation-evidence-lookup-api.md).
Its packed
[`examples/x402-reputation-evidence-lookup-client.js`](./examples/x402-reputation-evidence-lookup-client.js)
is runnable from the consumer project root with:

```bash
node node_modules/@brainai/satp-client/examples/x402-reputation-evidence-lookup-client.js
```

### Runtime Policy Adapter Helper

`createRuntimePolicyAdapter(opts)` provides a host-oriented wrapper around the
offline runtime policy helpers:

```javascript
const { createRuntimePolicyAdapter } = require('@brainai/satp-client');

const adapter = createRuntimePolicyAdapter({
  defaultActionType: 'mcp_protected_tool',
  now: () => '2026-05-21T00:00:00Z',
  policy: { minimumTrustScore: 70, maxAutoSpendUsd: 0 },
});

const action = adapter.action({
  resource: 'mcp://protected/readiness',
  capability: 'mcp:read',
});
const result = adapter.evaluate(identityPayload, action);
const trace = adapter.auditTrace(identityPayload, action, { result });
const summary = adapter.explain(result);
```

The adapter only builds local descriptors, local decisions, redacted audit
traces, and display-safe reason summaries. It does not call RPC, read keypairs,
sign, send transactions, approve x402 spend, treat payment as action
authorization, write Solana state, deploy, publish, or restart production.

### Wallet-Control Challenge Helpers

`buildWalletControlChallenge(opts)` creates a canonical, offline challenge that
binds an agent ID to a Solana wallet. It derives the SATP V3 Genesis PDA and
linked-wallet PDA from `agentId`, `wallet`, and `network`, includes a nonce and
expiry, and returns plain JSON. It does not connect to RPC, read keypairs,
create transactions, sign, send, deploy, or mutate chain state.

`canonicalWalletControlChallenge(challenge)` returns the exact UTF-8 message a
wallet signs. `verifyWalletControlChallengeSignature(opts)` verifies a 64-byte
Ed25519 signature against the challenge wallet and fails closed for mismatched
wallets, signatures, agent IDs, PDAs, domain, audience, expiry, and replayed
nonces supplied by your replay cache.

```javascript
const {
  buildWalletControlChallenge,
  canonicalWalletControlChallenge,
  verifyWalletControlChallengeSignature,
} = require('@brainai/satp-client');

const challenge = buildWalletControlChallenge({
  agentId: 'brainChain',
  wallet: walletPublicKey,
  audience: 'my-service',
  nonce: crypto.randomBytes(16).toString('hex'),
});

// Ask the wallet to sign this exact canonical string.
const message = canonicalWalletControlChallenge(challenge);

const verification = verifyWalletControlChallengeSignature({
  challenge,
  signature,
  expectedWallet: walletPublicKey,
  expectedAgentId: 'brainChain',
  expectedAudience: 'my-service',
  usedNonces: replayCache,
});
if (!verification.ok) throw new Error(verification.errors.join('; '));
```

### Constructor

```javascript
const sdk = new SATPV3SDK({ network, rpcUrl });
// network: 'devnet' (default) or 'mainnet'.
// rpcUrl: optional custom RPC endpoint
```

---

### Identity Methods (20)

| Method | Description |
|--------|-------------|
| `buildCreateIdentity(creator, agentId, meta)` | Create a new agent identity (Genesis Record) |
| `buildBurnToBecome(authority, agentId, faceImage, faceMint, faceBurnTx)` | Burn NFT to set agent's face (birth ritual) |
| `buildUpdateIdentity(authority, agentId, updates)` | Update mutable fields (description, capabilities, metadata) |
| `buildProposeAuthority(authority, agentId, newAuthority)` | Propose authority transfer (2-step) |
| `buildAcceptAuthority(newAuthority, agentId)` | Accept proposed authority transfer |
| `buildCancelAuthorityTransfer(authority, agentId)` | Cancel pending authority transfer |
| `buildRegisterName(authority, agentId, name)` | Register a unique name for an agent |
| `buildReleaseName(authority, agentId, name)` | Release a registered name |
| `buildLinkWallet(authority, agentId, wallet, chain, label)` | Link an external wallet to identity |
| `buildUnlinkWallet(authority, agentId, wallet)` | Unlink an external wallet |
| `buildInitMintTracker(authority, agentId)` | Initialize NFT mint tracker |
| `buildRecordMint(authority, agentId)` | Record an NFT mint event |
| `buildDeactivateIdentity(authority, agentId)` | Deactivate an identity |
| `buildReactivateIdentity(authority, agentId)` | Reactivate a deactivated identity |
| `getGenesisRecord(agentId)` | Read a Genesis Record from chain |
| `hasIdentity(agentId)` | Check if an agent has an identity |
| `getEscrowPDA(client, description, nonce)` | Derive escrow PDA (sync) |
| `buildMigrateV2ToV3(v2Authority, agentId, meta)` | Migrate from V2 to V3 identity |

#### Genesis Record Fields

```javascript
const record = await sdk.getGenesisRecord('brainChain');
// Returns:
{
  agentIdHash: string,     // SHA-256 of agent_id
  agentName: string,       // Display name
  description: string,     // Agent description
  category: string,        // e.g. "developer", "assistant"
  capabilities: string[],  // e.g. ["solana", "code"]
  metadataUri: string,     // Off-chain metadata URL
  faceImage: string,       // Face image URL (after birth)
  faceMint: string,        // NFT mint address (after birth)
  faceBurnTx: string,      // Burn transaction signature
  genesisRecord: number,   // Unix timestamp of birth
  isBorn: boolean,         // Whether agent has completed birth ritual
  isActive: boolean,       // Whether identity is active
  authority: string,       // Current authority pubkey
  pendingAuthority: string | null,
  reputationScore: number, // CPI-updated reputation
  validationLevel: number, // CPI-updated validation
  createdAt: number,       // Unix timestamp
  updatedAt: number,       // Unix timestamp
}
```

---

### Reviews Methods (7)

| Method | Description |
|--------|-------------|
| `buildInitReviewCounter(payer, agentId)` | Initialize review counter for an agent |
| `buildCreateReview(reviewer, agentId, rating, text, metadata, opts)` | Create a 1-5 star review |
| `buildCreateReviewWithSelfCheck(reviewer, agentId, rating, text, metadata)` | Create review with self-review prevention |
| `buildUpdateReview(reviewer, reviewPDA, updates)` | Update an existing review |
| `buildDeleteReview(reviewer, reviewPDA)` | Soft-delete a review |
| `getReview(agentId, reviewer)` | Read a review from chain |
| `getReviewCount(agentId)` | Get total review count for an agent |

```javascript
// Create a review
const tx = await sdk.buildCreateReview(
  reviewerPubkey,
  'brainChain',      // agent being reviewed
  5,                 // rating (1-5)
  'Excellent Solana dev',
  'metadata',
  { category: 'development' }
);
```

---

### Attestations Methods (3)

| Method | Description |
|--------|-------------|
| `buildCreateAttestation(issuer, agentId, type, proofData, expiresAt)` | Issue an attestation |
| `buildVerifyAttestation(issuer, attestationPDA)` | Mark attestation as verified |
| `buildRevokeAttestation(issuer, attestationPDA)` | Revoke an attestation |

```javascript
// Issue a KYC attestation
const tx = await sdk.buildCreateAttestation(
  issuerPubkey,
  'brainChain',
  'kyc',             // attestation type
  'proof-hash-here',
  Math.floor(Date.now()/1000) + 86400 * 365 // expires in 1 year
);
```

---

### Reputation & Validation Methods (2)

| Method | Description |
|--------|-------------|
| `buildRecomputeReputation(caller, agentId, reviewAccounts)` | Recompute reputation score from reviews (CPI → identity) |
| `buildRecomputeLevel(caller, agentId, attestationAccounts)` | Recompute validation level from attestations (CPI → identity) |

These use Cross-Program Invocation to update fields directly on the Genesis Record.

---

### Escrow Methods (10)

App-agnostic escrow builders for downstream applications that need unsigned
SATP escrow transactions. Product-specific marketplace records, fees, job
workflow, moderation, and display copy stay in the consuming application.

| Method | Description |
|--------|-------------|
| `buildCreateEscrow(client, agentWallet, agentId, amount, description, deadline, nonce, opts)` | Create SOL escrow for a job |
| `buildSubmitWork(agent, escrowPDA, workProof)` | Agent submits work proof |
| `buildEscrowRelease(client, agent, escrowPDA)` | Client releases full payment |
| `buildPartialRelease(client, agent, escrowPDA, amount)` | Client releases partial payment |
| `buildCancelEscrow(client, escrowPDA)` | Cancel escrow (refund client) |
| `buildRaiseDispute(signer, escrowPDA, reason)` | Raise a dispute |
| `buildResolveDispute(arbiter, agent, client, escrowPDA, agentAmt, clientAmt)` | Arbiter resolves dispute |
| `buildExtendDeadline(client, escrowPDA, newDeadline)` | Extend job deadline |
| `buildCloseEscrow(client, escrowPDA)` | Close completed/cancelled escrow (reclaim rent) |
| `getEscrow(escrowPDA)` | Read escrow state from chain |

#### Escrow Lifecycle

```
Created → WorkSubmitted → Released (full or partial)
   ↓           ↓              ↓
Cancelled   Disputed     Closed (rent reclaimed)
               ↓
          Resolved (split)
               ↓
            Closed
```

```javascript
// Create an escrow (0.5 SOL for a generic work agreement)
const tx = await sdk.buildCreateEscrow(
  clientPubkey,
  agentWallet,
  'brainChain',
  0.5 * 1e9,        // lamports
  'Complete agreed work',
  Math.floor(Date.now()/1000) + 86400 * 7, // 7 day deadline
  0,                 // nonce (for multiple escrows with same description)
  { arbiter: arbiterPubkey }
);
```

---

### PDA Helpers (exported from `v3-pda.js`)

```javascript
const {
  hashAgentId,                  // SHA-256 hash of agent_id string
  hashName,                     // SHA-256 hash of name string
  getGenesisPDA,                // [b"genesis_record", agent_id_hash]
  getNameRegistryPDA,           // [b"name_registry_v3", name_hash]
  getLinkedWalletPDA,           // [b"linked_wallet_v3", agent_id_hash, wallet]
  getV3MintTrackerPDA,          // [b"mint_tracker_v3", agent_id_hash]
  getV3ReviewPDA,               // [b"review_v3", agent_id_hash, reviewer]
  getV3ReviewCounterPDA,        // [b"review_counter_v3", agent_id_hash]
  getV3AttestationPDA,          // [b"attestation_v3", agent_id_hash, issuer, type_hash]
  getV3ReputationAuthorityPDA,  // [b"reputation_authority", agent_id_hash]
  getV3ValidationAuthorityPDA,  // [b"validation_authority", agent_id_hash]
  getV3EscrowPDA,               // [b"escrow_v3", client, desc_hash, nonce_le]
  getV3ProgramIds,              // Returns all 6 program IDs for network
} = require('@brainai/satp-client/src/v3-pda');
```

---

### Escrow SDK Utilities (exported from `v3-sdk.js`)

```javascript
const {
  deriveEscrowPda,    // Derive escrow PDA from params
  descriptionHash,    // SHA-256 hash of description string
  EscrowStatus,       // Enum: { Active: 0, WorkSubmitted: 1, Released: 2, Cancelled: 3, Disputed: 4, Resolved: 5 }
  escrowStatusLabel,  // Convert status number to human-readable string
  escrowRemaining,    // Calculate remaining escrow balance
  isEscrowExpired,    // Check if escrow has passed deadline
} = require('@brainai/satp-client/src/v3-sdk');
```

## Transaction Pattern

All `build*` methods return an **unsigned** `Transaction` object. Your application is responsible for:

1. Setting `recentBlockhash` and `feePayer`
2. Signing with the appropriate wallet
3. Sending to the network

```javascript
const tx = await sdk.buildCreateIdentity(wallet.publicKey, 'myAgent', { ... });
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
tx.feePayer = wallet.publicKey;
tx.sign(wallet);
const sig = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(sig);
```

## Consumer APIs

SATP core does not define or host an HTTP API. Downstream applications may wrap
the SDK with their own read APIs, but those routes are consumer-owned adapters
and must not be treated as SATP protocol authority.

## Testing

The npm artifact does not ship the repository's maintainer test suites. Run
those suites only from a source checkout using the repository-root scripts in
the [source package manifest](https://github.com/brainAI-bot/satp/blob/main/package.json).
Installed-package consumers can exercise every offline example linked in this
README using the consumer-root commands in the relevant sections above.

## Network Configuration

```javascript
// Devnet (default)
const sdk = new SATPV3SDK();

// Explicit devnet
const sdk = new SATPV3SDK({ network: 'devnet' });

// Custom RPC
const sdk = new SATPV3SDK({ rpcUrl: 'https://my-rpc.example.com' });

// Mainnet uses the V3 registry IDs documented in Anchor.toml [programs.mainnet].
const sdk = new SATPV3SDK({ network: 'mainnet' });
```

## Borsh Deserialization Helpers (v3.6.0)

Zero-dependency Borsh deserialization for all 8 SATP V3 account types. Decode raw on-chain data without the `borsh` library.

### Supported Account Types

| Account | Program | Deserializer |
|---------|---------|-------------|
| GenesisRecord | Identity V3 | `deserializeGenesisRecord(data)` |
| LinkedWallet | Identity V3 | `deserializeLinkedWallet(data)` |
| MintTracker | Identity V3 | `deserializeMintTracker(data)` |
| NameRegistry | Identity V3 | `deserializeNameRegistry(data)` |
| Review | Reviews V3 | `deserializeReview(data)` |
| ReviewCounter | Reviews V3 | `deserializeReviewCounter(data)` |
| Attestation | Attestations V3 | `deserializeAttestation(data)` |
| EscrowV3 | Escrow V3 | `deserializeEscrowV3(data)` |

### Usage: Typed Deserialization

```js
const { deserializeGenesisRecord, deserializeAttestation } = require('@brainai/satp-client');
const { Connection, PublicKey } = require('@solana/web3.js');

const conn = new Connection('https://api.devnet.solana.com');

// Fetch raw account and deserialize
const acct = await conn.getAccountInfo(new PublicKey('...'));
const genesis = deserializeGenesisRecord(acct.data);
console.log(genesis.agentName, genesis.reputationScore, genesis.isBorn);
```

Genesis parsing is layout-aware for RC-S6 review. Parsed records include
`layout` and `hasIsActiveField`; `isActive` is `null` when the account bytes do
not carry the historical `is_active` field.

### Usage: Auto-detect Account Type

```js
const { deserializeAccount } = require('@brainai/satp-client');

// Automatically detects type from 8-byte Anchor discriminator
const { type, data } = deserializeAccount(acct.data);
console.log(type);  // "GenesisRecord" | "Attestation" | "EscrowV3" | ...
console.log(data);  // Fully parsed object
```

### Usage: Batch Deserialization (getProgramAccounts)

```js
const { deserializeBatch, DISCRIMINATORS } = require('@brainai/satp-client');

const accounts = await conn.getProgramAccounts(REVIEWS_PROGRAM_ID);
const reviews = deserializeBatch(accounts, 'Review');
// [{ pubkey: "...", type: "Review", data: { agentId, rating, ... } }, ...]
```

### Usage: BorshReader (Custom Deserialization)

```js
const { BorshReader } = require('@brainai/satp-client');

// Low-level reader for custom account layouts
const r = new BorshReader(acct.data);
r.skipDiscriminator();           // skip 8-byte Anchor discriminator
const hash = r.readFixedBytes32(); // [u8; 32]
const name = r.readString();     // Borsh String
const items = r.readVecString(); // Vec<String>
const pk = r.readPubkeyBase58(); // Pubkey → base58
const opt = r.readOptionI64();   // Option<i64> → number | null
```

### Discriminator Utilities

```js
const { isAccountType, getAccountDiscriminator, DISCRIMINATORS } = require('@brainai/satp-client');

// Check account type before deserializing
if (isAccountType(acct.data, 'EscrowV3')) {
  const escrow = deserializeEscrowV3(acct.data);
}

// Get discriminator for filtering
const disc = getAccountDiscriminator('Attestation'); // 8-byte Buffer
// Use with getProgramAccounts memcmp filter
```

## Security

- All transactions are returned **unsigned** — the SDK never holds private keys
- PDA derivation is deterministic and verified against on-chain seeds
- CPI boundaries enforce program-level authorization
- Escrow funds are held by PDA-owned accounts (no custodial risk)

## License

MIT — brainAI 2026

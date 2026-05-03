# SATP Specification

**Status:** Draft v1 for extraction planning  
**Repo:** `github.com/brainAI-bot/satp`  
**Lead:** brainChain  
**Consumer review:** brainForge / AgentFolio  
**Security review:** brainShield  
**Approver:** brainKID  
**Last updated:** 2026-05-03

> SATP is the Solana Agent Trust Protocol.
>
> This specification defines protocol semantics and package boundaries for extracting SATP from AgentFolio into this repo. It is a docs-only extraction planning artifact: it does not deploy programs, rotate keys, publish npm packages, or change AgentFolio product code.

---

## 1. Scope

SATP standardizes portable AI-agent identity, attestations, reputation, validation, reviews, and escrow primitives on Solana.

SATP owns:

```text
protocol semantics
program/IDL interface definitions
PDA derivation rules
SDK/package interfaces
claim and validation schemas
conformance tests
security/key-management rules for SATP code
```

SATP does not own:

```text
AgentFolio marketplace UX
AgentFolio profiles/database schema
AgentFolio routing and API policy
AgentFolio analytics/search/moderation
AgentFolio job-board workflow
AgentFolio public launch or marketing
client-specific product work
```

Dependency direction is one-way:

```text
AgentFolio and other apps -> @brainai/satp packages -> SATP IDLs/programs
```

SATP must not import AgentFolio application modules or require AgentFolio infrastructure.

---

## 2. Versioning and compatibility

### 2.1 Package names

Stable target package:

```text
@brainai/satp
```

Supporting packages:

```text
@brainai/satp-core
@brainai/satp-solana
@brainai/satp-client
```

Legacy package names such as `@brainai/satp-v3` are migration aliases only.

### 2.2 Spec versions

Every public protocol surface should carry an explicit semantic version:

```text
specVersion: "1.0.0"
idlVersion: "<program IDL version>"
formulaVersion: "<reputation/validation formula version>"
```

Breaking changes require:

1. a SPEC.md update,
2. a CHANGELOG.md entry,
3. conformance-test updates,
4. AgentFolio adapter compatibility review.

---

## 3. Protocol object model

### 3.1 Agent identity

An Agent Identity is the root SATP object for an AI agent.

Required semantics:

```text
identity_id: stable on-chain account/PDA address
agent_id: app-readable unique identifier when present
authority: wallet or authority allowed to update identity metadata
primary_wallet: canonical linked Solana wallet
metadata_uri: off-chain metadata URI, optional
metadata_hash: content hash for metadata, optional but preferred
status: active | suspended | revoked | migrated
created_at: chain timestamp or slot-derived timestamp when available
updated_at: chain timestamp or slot-derived timestamp when available
```

Rules:

- One identity may have multiple linked accounts, but only one primary authority at a time.
- Authority changes must be explicit and auditable.
- Identity metadata must be app-agnostic; AgentFolio-specific profile fields stay in AgentFolio.
- Consumers must treat identity records as protocol data, not as product profile rows.

### 3.2 Linked accounts

Linked accounts prove control of external wallets/accounts/platform handles.

Required semantics:

```text
subject_identity: identity being linked
account_kind: solana_wallet | github | domain | agentmail | mcp | a2a | custom
account_ref: normalized public reference
proof_hash: hash of proof material, optional
issuer: verifier or authority that accepted the link
expires_at: optional expiration
enabled: boolean
```

Linked-account verification UX remains consumer-specific. SATP only standardizes stored/verified linkage outputs.

---

## 4. Attestations

An Attestation is a verifiable claim issued about an identity, wallet, capability, job, or protocol event.

Required semantics:

```text
attestation_id: PDA/account or deterministic record id
issuer: issuer identity or wallet
subject_identity: SATP identity being attested
claim_type: normalized claim type
claim_value: typed value or compact string
evidence_uri: optional off-chain evidence URI
evidence_hash: optional hash of evidence
issued_at: issue timestamp/slot
expires_at: optional expiry
revoked_at: optional revocation timestamp/slot
status: active | expired | revoked | superseded
```

Core claim types:

```text
identity.github_verified
identity.domain_verified
identity.agentmail_verified
identity.wallet_control_verified
identity.mcp_verified
identity.a2a_verified
capability.verified
work.job_completed
work.escrow_released
review.received
risk.flagged
```

Rules:

- Issuers must be explicit.
- Revocation must never delete historical existence; it changes effective status.
- Consumers must verify issuer trust class before using an attestation for validation.
- App-specific badges or labels are consumer presentation and stay outside SATP core.

---

## 5. Issuer trust classes

SATP validation depends on issuer quality.

Trust classes:

| Class | Meaning | Examples |
| --- | --- | --- |
| `self` | Self-asserted by identity authority | agent metadata claim |
| `platform` | Issued by a consumer platform | AgentFolio marketplace action |
| `protocol` | Issued by SATP-controlled protocol process | canonical recomputation job |
| `partner` | Issued by trusted third-party verifier | external verification partner |
| `security` | Issued by security/review authority | brainShield or future auditor |

Rules:

- Trust classes are inputs, not final validation levels.
- A consumer may display issuer-specific labels, but validation formulas must remain documented and versioned.
- Unknown issuers are allowed but cannot silently count as protocol/security class.

---

## 6. Reputation

A Reputation Snapshot is a versioned, recomputable trust score derived from SATP inputs.

Required semantics:

```text
subject_identity: identity being scored
score: integer or fixed-point score
level_hint: optional derived level
formula_version: formula identifier
input_refs: attestations/reviews/events used
computed_at: timestamp/slot
computed_by: issuer or computation authority
metadata_hash: optional proof bundle hash
```

Rules:

- Reputation must be explainable from input references when possible.
- Score ranges and display tiers are formula-version-specific.
- AgentFolio display copy such as tier names can consume SATP outputs but must not define the protocol.

Initial score guidance:

```text
0-49: limited evidence
50-99: basic verified evidence
100-199: established evidence
200-399: high-trust evidence
400+: sovereign/high-assurance evidence
```

These ranges are migration guidance only until a dedicated formula document lands.

---

## 7. Validation

Validation is the normalized level derived from identity, attestations, reputation, and issuer trust.

Initial SATP validation levels:

| Level | Name | Minimum semantic requirement |
| --- | --- | --- |
| `0` | Unverified | Identity exists or is known but has no trusted verification. |
| `1` | Basic | Wallet/identity control is verified by self or platform evidence. |
| `2` | Verified | At least one trusted external or platform attestation is active. |
| `3` | Established | Multiple active attestations or durable reputation evidence exist. |
| `4` | Trusted | High-quality issuer evidence and positive work/review history exist. |
| `5` | Sovereign | Highest-assurance identity, authority, and reputation requirements are met. |

Validation result semantics:

```text
subject_identity: identity being validated
level: 0..5
formula_version: validation formula identifier
input_refs: attestation/reputation/review refs used
computed_at: timestamp/slot
expires_at: optional expiry
status: active | expired | revoked | superseded
```

Rules:

- Validation levels must be recomputable or explainable through input refs.
- Consumers may choose stricter display rules but must not relabel protocol levels without documenting their app-specific policy.
- Negative/security attestations can cap or revoke validation even when positive signals exist.

---

## 8. Reviews

A Review is a portable protocol primitive for feedback about an identity or work reference.

Required semantics:

```text
review_id: PDA/account or deterministic id
reviewer_identity: reviewer identity or wallet
subject_identity: reviewed identity
rating: integer or categorical value
review_type: work | capability | platform | security | custom
linked_ref: optional job/escrow/external reference
metadata_uri: optional review content URI
metadata_hash: optional content hash
created_at: timestamp/slot
status: active | hidden | disputed | revoked
```

Rules:

- SATP stores portable review primitives, not AgentFolio moderation policy.
- Consumer apps own display, copy, moderation queues, and abuse workflows.
- Reviews used in validation/reputation must be included as input refs.

---

## 9. Escrow

SATP escrow is a generic primitive for agent work settlement.

Required semantics:

```text
escrow_id: PDA/account
payer: funding wallet
agent_identity: agent identity expected to perform work
amount: token amount
mint: token mint
state: created | funded | submitted | released | refunded | disputed | closed
work_ref: optional job/work metadata ref
created_at: timestamp/slot
updated_at: timestamp/slot
```

Rules:

- SATP escrow should be generic and app-agnostic.
- AgentFolio job records, copy, marketplace fees, and UX stay in AgentFolio.
- Escrow events may produce attestations and reputation inputs.

---

## 10. PDA and IDL rules

SATP PDA helpers must live in `@brainai/satp-solana` and expose stable functions for:

```text
identity PDA derivation
attestation PDA derivation
review PDA derivation
reputation/validation record PDA derivation
escrow PDA derivation
```

IDL rules:

- Current IDLs move into `idls/` and are versioned.
- Generated clients live under `packages/satp-solana` or `packages/satp-client`.
- Program IDs live in a documented registry file and `docs/program-ids.md`.
- Devnet/mainnet IDs must be separated and never inferred from local keypair paths.

---

## 11. SDK boundaries

### 11.1 `@brainai/satp-core`

Owns app-agnostic types and pure helpers:

```text
claim schemas
validation levels
issuer trust classes
reputation formula types
normalization helpers
conformance assertions
```

Must not import Solana Web3, Express, AgentFolio DB, or browser-only code.

### 11.2 `@brainai/satp-solana`

Owns Solana-specific protocol interfaces:

```text
program IDs
IDL exports
PDA derivation
account decoders
transaction builders
RPC read helpers
```

Must not import AgentFolio routes, AgentFolio DB, or AgentFolio profile-store code.

### 11.3 `@brainai/satp-client`

Owns high-level SDK methods for apps:

```text
resolveIdentity
getAttestations
verifyAttestation
getReputation
getValidationLevel
getReviews
buildEscrowTransactions
```

May depend on `satp-core` and `satp-solana`. Must not depend on AgentFolio application modules.

### 11.4 `@brainai/satp`

Umbrella package that re-exports stable public APIs from core/solana/client.

---

## 12. AgentFolio consumer-only boundary

AgentFolio keeps only consumer/adaptor code:

```text
route handlers that call SATP package APIs
profile/database enrichment code that caches SATP outputs
UI formatting and marketplace-specific labels
job/review/escrow UX and moderation
AgentFolio-specific analytics/search
temporary compatibility shims during migration
```

AgentFolio must stop being source of truth for:

```text
canonical SATP IDLs
canonical PDA derivation helpers
canonical validation level definitions
canonical reputation formulas
canonical attestation claim schemas
canonical protocol docs
```

During migration, AgentFolio may keep adapter files that import from local relative paths until the SATP package/Git dependency is wired. Those files must be marked as temporary and consumer-only.

---

## 13. Extraction sequence

The extraction sequence is controlled by HQ and must remain reviewable:

1. Security guardrails/keypair decision.
2. Architecture docs.
3. AgentFolio SATP adapter boundary.
4. Move SATP IDLs/client/spec docs into SATP repo.
5. Independent SATP build/test.
6. AgentFolio consumes SATP package/Git dependency.
7. Remove embedded SATP source-of-truth files from AgentFolio.

This SPEC.md supports steps 3 and 4. It does not execute deploy, keypair, package publish, or AgentFolio product changes.

---

## 14. Validation requirements for extraction PRs

Docs/spec extraction PRs must include:

```text
git diff summary
list of changed files
no-deploy confirmation
no-keypair confirmation
no-npm-publish confirmation
brainForge adapter compatibility consultation
brainKID review request
```

Code extraction PRs later must include:

```text
unit tests for pure schema/PDA helpers
IDL parse validation
SDK build/typecheck
conformance test plan
AgentFolio adapter compatibility proof
```

---

## 15. Non-actions in this phase

This phase explicitly does not perform:

```text
Solana devnet deploys
Solana mainnet deploys
production keypair movement
production keypair rotation
secret printing
npm publishing
AgentFolio product feature changes
Masthead work
client work
public launch work
```

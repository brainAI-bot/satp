# SATP Specification

**Status:** Draft v1 for extraction planning  
**Repo:** `github.com/brainAI-bot/satp`  
**Source architecture:** `ARCHITECTURE.md` / SATP Architecture Final v1  
**Owner:** brainChain  
**Consumer review:** brainForge  
**Security review:** brainShield  
**Final approval:** brainKID

> This document defines the protocol semantics that must move into the SATP repo before AgentFolio treats SATP as an external source of truth.
>
> This is documentation/specification only. It does not deploy programs, move keys, publish packages, or change AgentFolio runtime behavior.

---

## 1. Scope

SATP is the Solana Agent Trust Protocol. It owns portable AI-agent identity, attestations, trust/reputation primitives, validation levels, review references, and protocol-level escrow references.

SATP must be usable by AgentFolio and third-party agent platforms without depending on AgentFolio APIs or database schema.

AgentFolio is the first consumer, not the protocol owner.

---

## 2. Non-goals

This SPEC does not authorize:

```text
Solana devnet deploys
Solana mainnet deploys
production keypair changes
production keypair movement
npm publish
AgentFolio product feature work
Masthead work
client work
public launch
```

Any implementation PR that follows this SPEC must stay staged, reviewable, and reversible.

---

## 3. Dependency direction

```text
AgentFolio / third-party apps
  consume
SATP SDK / generated clients / IDLs / program IDs / protocol docs
  owned by
brainAI-bot/satp
```

SATP must not import AgentFolio code, read AgentFolio DB tables, rely on AgentFolio API routes, or encode AgentFolio marketplace workflows.

---

## 4. Protocol modules

### 4.1 Identity

SATP identity represents a portable agent identity record.

Required concepts:

```text
identity_id
identity_pda
controller_wallet
agent_uri_or_hash
created_at
updated_at
status
cluster
program_id
```

Identity status values should include:

```text
active
revoked
superseded
suspended
```

### 4.2 Wallet/account linkage

SATP may represent wallet or account proofs for an agent identity.

Required concepts:

```text
identity_id
wallet_address
chain_or_cluster
proof_type
proof_reference
issuer
issued_at
expires_at
revoked_at
```

Raw OAuth tokens, private keys, seed phrases, API keys, or private client data must never be stored in SATP metadata.

### 4.3 Attestations

Attestations are issuer-signed claims about an identity.

Required concepts:

```text
attestation_id
identity_id
issuer
issuer_trust_class
claim_type
claim_hash
metadata_uri
metadata_hash
issued_at
expires_at
revoked_at
status
```

Expired or revoked attestations are invalid for current trust calculations.

### 4.4 Issuer trust classes

Issuer trust classes describe how consumers should weight issuers.

Initial classes:

```text
protocol_admin
platform_verified
self_attested
third_party_verified
community_reputation
```

Issuer governance must be defined before mainnet or third-party integrations:

```text
who can grant trusted issuer status
who can revoke trusted issuer status
how compromised issuers are marked
how consumers discover revoked issuers
how trust-class changes are versioned
```

### 4.5 Reputation and trust

SATP owns the event model and portable reputation primitives. Consumers may cache display values but must not own canonical formulas.

Required concepts:

```text
reputation_snapshot_id
identity_id
input_attestations
input_reviews
input_validations
score_version
score_value
score_breakdown_hash
computed_at
expires_at
```

Score formulas must be versioned and recomputable from protocol references wherever possible.

### 4.6 Reviews

SATP reviews represent portable review references and integrity metadata. AgentFolio may own the review UX and moderation workflow, but SATP owns portable review primitives.

Required concepts:

```text
review_id
identity_id
reviewer_identity_or_wallet
rating_or_signal
review_hash
metadata_uri
metadata_hash
issued_at
revoked_at
status
```

### 4.7 Validation levels

Validation levels provide coarse-grained identity confidence.

Initial conceptual levels:

```text
L0 none
L1 wallet linked
L2 basic attestations
L3 operationally verified
L4 high-confidence multi-issuer verification
L5 sovereign / human-or-authority backed verification
```

The final level calculation must live in SATP docs/SDK/specs, not AgentFolio business logic.

### 4.8 Escrow references

SATP may define protocol-level escrow references. AgentFolio owns marketplace escrow UX and platform records.

Required concepts:

```text
escrow_id
identity_id
counterparty_reference
amount_reference
asset_reference
status
transaction_signature
metadata_hash
created_at
settled_at
```

---

## 5. Metadata and privacy rules

SATP metadata must be privacy-aware.

Do not store raw:

```text
PII
OAuth tokens
API keys
private client data
sensitive prompts
seed phrases
private keys
session cookies
unredacted logs
```

Use hashes, URIs, redacted payloads, or off-chain references when appropriate. `metadata_uri` plus `metadata_hash` is preferred for auditable but privacy-preserving references.

---

## 6. Package and module targets

Stable package target:

```text
@brainai/satp
```

Possible package split:

```text
packages/satp-core        # shared schemas, constants, validation helpers
packages/satp-solana      # program IDs, generated clients, PDA helpers
packages/satp-sdk         # browser/node SDK entrypoint
packages/satp-conformance # fixtures and conformance tests
```

Temporary migration aliases such as `@brainai/satp-v3` must be documented and removed after consumers migrate.

---

## 7. Source-of-truth rules

The SATP repo is the source of truth for:

```text
ARCHITECTURE.md
SPEC.md
SECURITY.md
docs/key-management.md
docs/program-ids.md
IDL files
generated client interfaces
program ID constants
PDA helper definitions
package version metadata
conformance fixtures
```

Before release, these must agree:

```text
docs/program-ids.md
Anchor.toml or equivalent program config
packages/satp-solana program constants
IDL metadata
published package version
```

A mismatch blocks release.

---

## 8. AgentFolio consumer boundary

AgentFolio may store/cache/display SATP references:

```text
satp_identity_id
satp_identity_pda
satp_attestation_id
satp_attestation_pda
satp_review_id
satp_reputation_snapshot_id
satp_validation_level
satp_escrow_id
satp_transaction_signature
satp_cluster
satp_program_id
```

AgentFolio must not own:

```text
SATP PDA seed rules outside the SDK
SATP account layouts outside generated clients
SATP IDL source files
SATP score formula internals
SATP upgrade authority config
Solana program keypairs
mainnet authority keys
protocol governance rules
```

---

## 9. Extraction map

Detailed extraction sequencing lives in `EXTRACTION_MAP.md`.

High-level order:

1. Security and key-management docs.
2. Architecture and SPEC source-of-truth docs.
3. AgentFolio adapter boundary.
4. Move SATP IDLs/client/spec docs into SATP repo.
5. Add independent SATP build/test/conformance checks.
6. Update AgentFolio to consume SATP via package or Git dependency.
7. Remove embedded SATP source-of-truth files from AgentFolio.

---

## 10. Required review gates

Before any implementation/extraction merge:

```text
brainChain owner review
brainForge AgentFolio consumer compatibility review
brainShield security/key-management review
brainKID final approval
```

Before any mainnet or production authority action, require explicit Hani/brainKID approval and brainShield security sign-off.

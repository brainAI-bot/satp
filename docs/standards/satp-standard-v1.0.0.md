# SATP Public Standard v1.0.0

**Standard:** Solana Agent Trust Protocol (SATP)
**Version:** 1.0.0
**Status:** Public self-serve standard draft
**Audience:** Agent platforms, MCP servers, x402 gateways, wallets, marketplaces, and tooling that need portable AI-agent trust data
**Last updated:** 2026-05-19

> This document defines the public SATP standard surface for third-party consumers.
> It is documentation-only. It does not deploy programs, publish packages, write to
> Solana devnet/mainnet, read or move keypairs, or change AgentFolio product code.

---

## 1. Purpose

SATP standardizes portable trust records for AI agents.

The standard lets a consumer answer five questions without depending on a single
marketplace database:

1. Which agent identity is this?
2. Which public wallets, accounts, capabilities, or endpoints are linked to it?
3. Which issuers made which claims about it?
4. What trust score and validation level follow from those claims?
5. Which proof material is needed for another app to verify the same result?

SATP is app-agnostic. AgentFolio is a first consumer of SATP, not the protocol
owner and not a required dependency for independent consumers.

---

## 2. Versioning

Every SATP integration MUST identify the standard and formula versions it uses.

Required version fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `standardVersion` | yes | SATP public standard version, for this document `1.0.0`. |
| `idlVersion` | yes when on-chain accounts are read | Version or commit of the IDLs used to decode Solana data. |
| `formulaVersion` | yes when scoring or validation is shown | Reputation/trust-score and validation formula version. |
| `schemaVersion` | yes for exported JSON records | Consumer-facing JSON schema version. |

Compatibility rules:

- Patch releases clarify wording or examples without changing required fields.
- Minor releases add optional fields, claim types, trust classes, or conformance tests.
- Major releases may change required fields, scoring semantics, or validation levels.
- Consumers MUST NOT silently mix records produced by incompatible major versions.

---

## 3. Identity

An SATP identity is the root record for an AI agent.

### 3.1 Required identity fields

| Field | Requirement |
| --- | --- |
| `identityId` | Stable SATP identity account, PDA, or deterministic record id. |
| `agentId` | Stable app-readable agent id when available. |
| `authority` | Public authority allowed to update mutable identity metadata. |
| `primaryWallet` | Canonical public Solana wallet when linked. |
| `metadataUri` | Optional URI for off-chain metadata. |
| `metadataHash` | Optional content hash for off-chain metadata. |
| `status` | `active`, `suspended`, `revoked`, or `migrated`. |
| `createdAt` | Chain timestamp, slot-derived timestamp, or verified source timestamp. |
| `updatedAt` | Chain timestamp, slot-derived timestamp, or verified source timestamp. |

### 3.2 Identity rules

- Identity records are protocol data, not marketplace profile rows.
- Authority changes MUST be explicit, auditable, and recoverable from public evidence.
- A consumer MAY map one SATP identity to local profile data, but local profile data
  MUST NOT be presented as SATP protocol truth.
- A suspended, revoked, or migrated identity MUST remain inspectable for historical
  verification; status changes do not erase prior records.

---

## 4. Linked Accounts

Linked accounts describe public accounts, wallets, domains, handles, or service
endpoints associated with an SATP identity.

### 4.1 Account kinds

Initial standard account kinds:

```text
solana_wallet
github
domain
agentmail
mcp
a2a
x402
custom
```

### 4.2 Required linked-account fields

| Field | Requirement |
| --- | --- |
| `subjectIdentity` | Identity the account is linked to. |
| `accountKind` | One of the standard kinds or a namespaced custom kind. |
| `accountRef` | Normalized public reference, never a private credential. |
| `issuer` | Issuer that verified or accepted the linkage. |
| `proofHash` | Hash of proof material when proof is not fully on-chain. |
| `evidenceUri` | Optional URI for public or access-controlled evidence. |
| `expiresAt` | Optional expiration timestamp. |
| `enabled` | Whether the linkage is currently effective. |

Consumers MUST normalize account references before comparison. For example, wallet
addresses use canonical base58 strings and domains use lowercase ASCII form.

---

## 5. Attestations

An attestation is an issuer-signed or issuer-recorded claim about an identity,
account, capability, job, or protocol event.

### 5.1 Required attestation fields

| Field | Requirement |
| --- | --- |
| `attestationId` | PDA, account, transaction-linked id, or deterministic record id. |
| `issuer` | Public issuer identity, wallet, or verifier id. |
| `issuerTrustClass` | Trust class assigned to the issuer for this claim. |
| `subjectIdentity` | Identity the claim is about. |
| `claimType` | Normalized claim type. |
| `claimValue` | Typed value or compact string. |
| `evidenceUri` | Optional evidence pointer. |
| `evidenceHash` | Optional hash of evidence bytes or canonical evidence JSON. |
| `issuedAt` | Issue timestamp or slot-derived timestamp. |
| `expiresAt` | Optional expiration timestamp. |
| `revokedAt` | Optional revocation timestamp. |
| `status` | `active`, `expired`, `revoked`, or `superseded`. |

### 5.2 Core claim types

```text
identity.wallet_control_verified
identity.github_verified
identity.domain_verified
identity.agentmail_verified
identity.mcp_verified
identity.a2a_verified
identity.x402_verified
capability.verified
work.job_completed
work.escrow_released
review.received
risk.flagged
```

Custom claim types MUST use a reverse-DNS or product namespace such as
`com.example.audit_passed`. Consumers MUST NOT treat custom claims as core claims
unless they have explicitly opted into that issuer and namespace.

### 5.3 Issuer trust classes

| Trust class | Meaning |
| --- | --- |
| `self` | Claimed by the identity authority. |
| `platform` | Issued by a consumer platform or marketplace. |
| `protocol` | Issued by a SATP-controlled or protocol-defined process. |
| `partner` | Issued by an external verification partner. |
| `security` | Issued by a security reviewer or auditor. |
| `unknown` | Issuer is known only as a public key or opaque id. |

Trust class is an input to validation, not a display badge by itself. Unknown
issuers MUST NOT silently count as `protocol`, `partner`, or `security`.

### 5.4 Attestation rules

- Issuer identity and trust class MUST be visible to consumers.
- Revocation MUST preserve historical existence and change effective status.
- Expired attestations MAY remain visible but MUST NOT count as active validation
  inputs unless a formula explicitly allows historical claims.
- Consumers SHOULD show evidence hashes or source references for trust-affecting
  attestations.

---

## 6. Reputation And Trust Score

SATP reputation is a versioned, recomputable trust score derived from public
protocol inputs.

### 6.1 Required score fields

| Field | Requirement |
| --- | --- |
| `subjectIdentity` | Identity being scored. |
| `score` | Integer or fixed-point trust score. |
| `scoreMax` | Maximum possible score under this formula. |
| `formulaVersion` | Versioned scoring formula id. |
| `inputRefs` | Attestations, reviews, and events used. |
| `computedAt` | Timestamp or slot when score was computed. |
| `computedBy` | On-chain program, protocol process, or consumer process. |

### 6.2 Score rules

- A displayed trust score MUST identify its formula version.
- A score MUST be reproducible from its declared inputs, or marked as a
  consumer-local score.
- Consumers MUST distinguish protocol scores from consumer-local overlays.
- Missing data MUST NOT be treated as negative data unless the formula states so.
- Risk flags MAY reduce score only through a documented formula.

---

## 7. Validation Levels

Validation levels provide a compact, consumer-friendly summary of trust state.

### 7.1 Standard levels

| Level | Name | Minimum meaning |
| --- | --- | --- |
| 0 | Unverified | No active SATP identity or insufficient public proof. |
| 1 | Registered | Active SATP identity exists. |
| 2 | Linked | Identity has at least one verified public account or wallet linkage. |
| 3 | Attested | Identity has active attestations from non-self issuers. |
| 4 | Trusted | Reputation/trust score crosses the formula-defined trusted threshold. |
| 5 | Sovereign | Strong identity, issuer diversity, durable history, and no active critical risk flags under the formula. |

### 7.2 Level rules

- Level calculation MUST identify its `formulaVersion`.
- Consumers MAY hide level names in favor of their own UI, but MUST preserve the
  underlying SATP level if they expose protocol data.
- Level increases and decreases MUST be explainable from input references.
- A level MUST NOT be upgraded solely from self-attestations.

---

## 8. MCP Touchpoints

MCP integrations expose SATP data to agents and tools through read APIs.

Recommended MCP tool categories:

| Tool category | Purpose |
| --- | --- |
| `satp.getPrograms` | Return program ids, supported networks, and IDL metadata. |
| `satp.resolveIdentity` | Resolve a wallet, agent id, or account ref into an SATP identity. |
| `satp.getAttestations` | Return normalized attestation records for an identity. |
| `satp.getTrust` | Return score, validation level, formula version, and input refs. |
| `satp.prepareAttestationRequest` | Prepare unsigned request metadata for a later explicit signing flow. |

MCP servers SHOULD be read-only by default. Any write-capable tool MUST separate
transaction construction from signing and MUST require explicit consumer approval
outside the MCP server's hidden control flow.

---

## 9. x402 Touchpoints

x402 integrations can use SATP to make access, payment, and agent-routing
decisions without embedding marketplace-specific trust logic.

Recommended x402 use cases:

- require a minimum SATP validation level before granting paid API access;
- use a trust score threshold to route high-risk requests for review;
- accept SATP identity and attestation references as payment-session metadata;
- include SATP evidence hashes in audit logs for disputed access decisions.

x402 gates MUST treat SATP as an input, not as proof of payment by itself. Payment
verification remains the x402 gateway's responsibility.

---

## 10. Conformance Terms

An implementation may claim one of these conformance levels.

| Term | Requirement |
| --- | --- |
| SATP-readable | Can decode and display identity, linked-account, attestation, score, and validation records for a declared version. |
| SATP-verifying | Can verify PDA/account derivations, issuer references, evidence hashes, score inputs, and formula version. |
| SATP-producing | Can create or prepare standard-compliant records without relying on AgentFolio-specific schema. |
| SATP-gateway | Can expose SATP-readable or SATP-verifying behavior through MCP, x402, API, or SDK interfaces. |

Required conformance evidence:

- standard version used;
- IDL or schema version used;
- formula version used for score/level outputs;
- fixture or test vectors used;
- pass/fail output from offline conformance tests where available;
- explicit statement of whether the implementation is read-only or write-capable.

---

## 11. Consumer Responsibilities

Consumers are responsible for how they use SATP data.

Consumers MUST:

- verify issuer trust class before relying on trust-affecting attestations;
- display or log enough evidence to explain trust score and validation decisions;
- keep local profile data separate from SATP protocol data;
- pin package, schema, IDL, and formula versions for reviewable releases;
- handle revoked, expired, suspended, and migrated records explicitly;
- avoid printing secrets, private keys, tokens, or raw credentials in SATP logs;
- avoid using AgentFolio-only database fields as protocol truth.

Consumers SHOULD:

- use commit-addressed dependencies until npm publication is explicitly approved;
- run offline conformance tests in CI;
- cache SATP reads with versioned cache keys;
- document any local scoring overlay separately from SATP formula outputs;
- expose read-only verification paths before enabling write paths.

---

## 12. Intentionally Out Of Scope

SATP v1.0.0 does not standardize or authorize:

- AgentFolio marketplace UI, ranking, search, analytics, or job-board behavior;
- client-specific product work or private customer workflow logic;
- public announcements, launch copy, or marketing pages;
- npm publication;
- Solana devnet or mainnet deploys;
- Solana keypair creation, movement, rotation, deletion, or secret handling;
- custody, wallet recovery, or funds-management policy;
- x402 payment settlement semantics;
- MCP client UX or model behavior;
- legal identity, KYC policy, sanctions screening, or regulatory compliance;
- private evidence storage formats beyond public hashes and evidence references.

Any future work in these areas requires a separate versioned spec update and the
appropriate HQ approval.

---

## 13. Minimum Public Record Shape

Consumers that export SATP JSON SHOULD use this minimum envelope:

```json
{
  "standard": "SATP",
  "standardVersion": "1.0.0",
  "schemaVersion": "1.0.0",
  "identity": {
    "identityId": "<identity-pda-or-record-id>",
    "agentId": "<agent-id>",
    "authority": "<public-authority>",
    "primaryWallet": "<public-wallet>",
    "status": "active"
  },
  "linkedAccounts": [],
  "attestations": [],
  "trust": {
    "score": 0,
    "scoreMax": 100,
    "formulaVersion": "satp-trust-v1",
    "validationLevel": 0,
    "inputRefs": []
  }
}
```

This envelope is a portability baseline. Implementations may add fields, but they
MUST NOT remove version information or mix local profile data into protocol fields
without namespacing it.

# SATP Architecture

**Status:** Final working architecture v1  
**Repo:** `github.com/brainAI-bot/satp`  
**Visibility:** Public  
**Lead:** brainChain  
**AgentFolio consumer review:** brainForge  
**Security/key-management gate:** brainShield  
**Final approval:** brainKID  
**Last updated:** 2026-04-26  

> This is the canonical SATP architecture document for the next build phase.
>
> Update this file in the same PR as any protocol architecture change.

---

## 1. Executive summary

SATP is the Solana Agent Trust Protocol.

It is a Solana-native protocol and SDK for portable AI-agent identity, attestations, trust, reputation, validation, reviews, and escrow references.

AgentFolio is the first consumer of SATP. AgentFolio is not the owner of SATP.

SATP must be usable by any third-party agent platform without relying on AgentFolio APIs or AgentFolio database schema.

Dependency direction:

```text
AgentFolio
third-party agent platforms
other Solana apps
  use
SATP SDK / IDLs / programs
```

SATP must never depend on AgentFolio.

Some legacy docs or package names may still say `@brainai/satp-v3`. The stable package target is:

```text
@brainai/satp
```

`@brainai/satp-v3` may be used only as a temporary migration alias.

---

## 2. Design goals

SATP exists to provide:

```text
portable agent identity
verifiable wallet/account linkage
verifiable attestations
revocable claims
issuer trust classes
recomputable reputation
portable review primitives
validation levels
on-chain transaction references
protocol-level escrow primitives
SDKs for browser and Node apps
conformance tests for third-party integrations
```

The standard should be:

```text
Solana-native
app-agnostic
SDK-first
IDL-versioned
security-reviewed
privacy-aware
minimally stateful on-chain
recomputable where possible
usable by AgentFolio without AgentFolio owning protocol logic
```

---

## 3. Non-goals

SATP does not own:

```text
AgentFolio marketplace UI
AgentFolio job board
AgentFolio application flow
AgentFolio database schema
AgentFolio analytics
AgentFolio profile page design
AgentFolio API keys/webhooks
client project management
brainAI HQ task orchestration
marketing pages
```

SATP should never become a dumping ground for AgentFolio product logic.

---

## 4. Operating model through HQ

Once HQ v4 is live, SATP work must be tracked in HQ Parallel Ops.

Recommended HQ project state:

```text
Project: SATP
Lane: p2_next until HQ stabilizes, then p1_active_build when extraction starts
Mode: planning until architecture/spec land, then building
Lead: brainChain
Consumer reviewer: brainForge
Security: brainShield
Approver: brainKID
```

Initial HQ tasks:

```text
SATP-ARCH-001
  Add this ARCHITECTURE.md to the SATP repo.
  Owner: brainChain
  Reviewer: brainKID
  Consult: brainForge

SATP-SPEC-001
  Create SPEC.md defining identity, attestation, reputation, review, validation, and escrow semantics.
  Owner: brainChain

SATP-SEC-001
  Create SECURITY.md and key-management policy.
  Owner: brainChain + brainShield

SATP-EXTRACT-001
  Move IDLs and client code from AgentFolio to SATP repo.
  Owner: brainChain
  Consumer review: brainForge

SATP-CONFORM-001
  Add conformance tests proving another app can verify SATP identity/attestation/trust without AgentFolio.
  Owner: brainChain
```

Architecture-impacting SATP PRs must include:

```text
Architecture impact
```

---

## 5. Current extraction state

SATP source-of-truth code is still being extracted from AgentFolio.

Current embedded source paths in AgentFolio may include:

```text
satp-client/
satp-idls/
src/routes/*satp*
src/routes/*identity-v3*
src/routes/*reputation-v3*
src/routes/*reviews-v3*
core-cm/
core-cm-v2/
tests or scripts that exercise SATP flows
```

Target repo:

```text
github.com/brainAI-bot/satp
```

SATP must become the source of truth for:

```text
protocol docs
IDLs
programs
SDK packages
conformance tests
security/key-management docs
```

AgentFolio later consumes SATP through `@brainai/satp` or a temporary Git dependency.

---

## 6. Target repo structure

```text
satp/
├── README.md
├── ARCHITECTURE.md
├── SPEC.md
├── SECURITY.md
├── CHANGELOG.md
├── LICENSE
├── Anchor.toml
├── programs/
│   ├── identity-registry/
│   ├── attestations/
│   ├── reputation/
│   ├── reviews/
│   ├── validation/
│   └── escrow/
├── idls/
│   ├── identity_registry.json
│   ├── attestations.json
│   ├── reputation.json
│   ├── reviews.json
│   ├── validation.json
│   └── escrow.json
├── packages/
│   ├── satp-core/
│   ├── satp-solana/
│   ├── satp-client/
│   └── satp/
├── examples/
│   ├── node/
│   ├── browser/
│   └── agentfolio-adapter/
├── tests/
│   ├── anchor/
│   ├── sdk/
│   ├── conformance/
│   └── integration/
├── scripts/
│   ├── build/
│   ├── deploy/
│   └── verify/
└── docs/
    ├── identity.md
    ├── attestations.md
    ├── reputation.md
    ├── reviews.md
    ├── validation.md
    ├── escrow.md
    ├── integration-guide.md
    ├── program-ids.md
    └── threat-model.md
```

If a program is not implemented yet, do not create fake source folders. It is acceptable to document planned modules before source exists.

---

## 7. Protocol modules

### 7.1 Identity registry

Purpose:

```text
register agent identity
resolve wallet to identity
link additional wallets/accounts
store metadata hash/URI
track status and authority
```

Identity is the root SATP object. Other SATP records reference identity.

### 7.2 Attestations

Purpose:

```text
issue claims about an agent identity
verify issuer and subject
support expiry
support revocation
store proof hash / metadata URI
enable portable claims across apps
```

Example claim types:

```text
github_verified
domain_verified
agentmail_verified
wallet_control_verified
job_completed
escrow_released
client_verified
capability_verified
```

### 7.3 Reputation

Purpose:

```text
compute or record trust/reputation snapshots
track formula version
link to input events/attestations/reviews
make scores recomputable when possible
```

Reputation is a versioned result derived from inspectable inputs, not just a number.

### 7.4 Reviews

Purpose:

```text
portable review primitive
reviewer identity
subject identity
rating or categorical score
metadata hash/URI
optional linked job/escrow reference
```

SATP stores portable review primitives. App-specific review display, moderation, and copy belong to the consuming app.

### 7.5 Validation

Purpose:

```text
derive validation level from identity, attestations, reputation, and issuer trust
record validation state
allow third-party apps to verify an agent level
```

Validation levels must be defined in `SPEC.md`.

### 7.6 Escrow

Purpose:

```text
generic escrow primitive for agent work
create escrow state
fund vault/PDA
release
refund
record dispute status where applicable
```

SATP escrow should remain generic. AgentFolio can build marketplace-specific records and UX around it.

---

## 8. System diagram

```text
AgentFolio / third-party app
  │
  ├── @brainai/satp
  │     └── stable public umbrella package
  │
  ├── @brainai/satp-client
  │     ├── high-level API
  │     ├── browser/Node integration
  │     ├── account fetching
  │     └── verification helpers
  │
  ├── @brainai/satp-solana
  │     ├── program IDs
  │     ├── PDA helpers
  │     ├── generated IDL clients
  │     └── transaction builders
  │
  ├── @brainai/satp-core
  │     ├── claim schemas
  │     ├── trust formula types
  │     ├── validation levels
  │     ├── serialization helpers
  │     └── conformance helpers
  │
  └── Solana RPC
        ├── identity_registry program
        ├── attestations program
        ├── reputation program
        ├── reviews program
        ├── validation program
        └── escrow program
```

Optional indexers or caches may exist, but the SDK must be able to verify core protocol state from Solana and documented off-chain metadata hashes.

---

## 9. Actors and authorities

### Subject

The agent identity being described.

### Owner wallet

Wallet authorized to manage an identity or link accounts.

### Issuer

Entity authorized to issue an attestation.

Possible issuers:

```text
brainAI
AgentFolio
verified client
third-party platform
automated verifier
user wallet
```

Issuer trust policy must be explicit. A claim from any wallet is not automatically trusted by every consumer.

### Verifier

A user, app, or service that validates SATP records.

### App integrator

A platform that consumes SATP. AgentFolio is the reference integrator.

### Upgrade authority

Entity controlling program upgrades while programs remain upgradeable.

Mainnet upgrade authority must be controlled by secure process:

```text
hardware wallet
multisig
or explicitly approved custody process
```

Upgrade authority key material must never be committed to Git.

---

## 10. Identity model

A SATP identity represents an AI agent, not necessarily a human.

Target identity fields:

```text
identity_id
identity_pda
owner_wallet
primary_wallet
metadata_uri
metadata_hash
display_name
created_at
updated_at
status
nonce / bump
version
```

Status values:

```text
active
suspended
revoked
migrated
```

Metadata should be off-chain and hash-addressed or integrity-protected.

Example metadata:

```json
{
  "name": "agent-name",
  "description": "Short agent description",
  "image": "ipfs://...",
  "external_url": "https://...",
  "skills": ["code", "research"],
  "links": {
    "agentfolio": "https://agentfolio.bot/profile/...",
    "github": "https://github.com/..."
  }
}
```

On-chain identity should store enough to verify ownership and metadata integrity, not enough to become a full profile database.

---

## 11. Wallet and account linkage

An identity may link multiple wallets/accounts.

Use cases:

```text
agent operator wallet
payout wallet
deployment authority wallet
GitHub account proof
domain proof
AgentMail inbox proof
platform account proof
```

Account links should be represented as attestations unless they require native identity state.

Target account link fields:

```text
identity_id
account_type
account_identifier_hash
issuer
proof_hash
created_at
expires_at
revoked_at
```

Never store OAuth tokens or private provider credentials on-chain.

---

## 12. Attestation model

An attestation is a verifiable claim.

Target attestation envelope:

```text
attestation_id
attestation_pda
issuer
subject_identity_id
subject_wallet
claim_type
claim_value_hash
metadata_uri
metadata_hash
issued_at
expires_at
revoked_at
revocation_reason_hash
schema_version
nonce / bump
```

Claim values should usually be hashed, not stored raw.

Claim type naming:

```text
lowercase_snake_case
```

Examples:

```text
github_verified
domain_verified
agentmail_verified
wallet_control_verified
job_completed
review_received
escrow_released
client_verified
capability_verified
```

Revocation must be first-class.

Attestation state:

```text
valid
expired
revoked
superseded
```

Consumers must treat expired or revoked attestations as invalid for current validation levels unless the spec explicitly says otherwise.

---

## 13. Review model

SATP reviews are portable reputation inputs.

Target review fields:

```text
review_id
review_pda
reviewer_identity_id
subject_identity_id
rating
category_scores_hash
metadata_uri
metadata_hash
linked_escrow_id
linked_job_hash
created_at
revoked_at
schema_version
```

Review body text, moderation state, and app-specific dispute handling remain in consuming apps unless explicitly standardized.

Ratings must define range and semantics in `SPEC.md`.

---

## 14. Reputation model

SATP reputation should be recomputable.

Principles:

```text
inputs are attestations, reviews, escrow outcomes, and validation events
formula is versioned
score snapshot is tied to formula version
raw score is not trusted unless inputs are inspectable or signed
apps can cache display values
third-party apps can recompute or verify snapshots
```

Target reputation snapshot:

```text
identity_id
score
level
formula_version
input_root_hash
computed_at
computed_by
transaction_signature
```

Recommended MVP:

```text
hybrid reputation
  on-chain: identities, attestations, reviews, selected snapshots
  off-chain: recomputation, indexing, richer analytics
  app cache: latest display score
```

Do not freeze mainnet score formulas until manipulation risk is studied.

---

## 15. Validation model

Validation turns identity and claims into a level.

Proposed levels:

```text
unverified
wallet_verified
profile_verified
work_verified
trusted
institutional
```

These names remain provisional until `SPEC.md` finalizes them.

Validation definition must include:

```text
required attestations
required issuer trust class
expiry rules
revocation rules
minimum reputation inputs
whether level can be recomputed permissionlessly
```

Target validation record:

```text
identity_id
level
formula_version
input_root_hash
validated_at
expires_at
validator
transaction_signature
```

---

## 16. Escrow model

SATP escrow is a generic agent-work escrow primitive.

Lifecycle:

```text
created
funded
in_progress
released
refunded
disputed
cancelled
expired
```

Target fields:

```text
escrow_id
escrow_pda
vault_pda
client_wallet
agent_identity_id
agent_wallet
mint
amount
platform_ref_hash
terms_hash
created_at
funded_at
released_at
refunded_at
status
bump
```

AgentFolio may store job terms and UX-specific status. SATP stores generic escrow state and verifiable transaction references.

Disputes are open design. Do not ship mainnet dispute semantics without a separate escrow spec and security review.

---

## 17. SDK architecture

Target package split:

```text
@brainai/satp-core
  pure types, schemas, validation helpers, score interfaces
  no wallet dependency

@brainai/satp-solana
  Solana program IDs, PDA helpers, IDL clients, transaction builders

@brainai/satp-client
  high-level SDK for apps, browser/Node compatible

@brainai/satp
  umbrella package re-exporting stable public APIs
```

Preferred public import:

```ts
import { SATPClient } from '@brainai/satp';
```

Target high-level API:

```ts
const satp = new SATPClient({
  cluster: 'devnet',
  rpcUrl: process.env.SOLANA_RPC_URL,
});

await satp.identity.resolveByWallet(wallet);
await satp.identity.register(input);
await satp.identity.linkWallet(input);

await satp.attestations.create(input);
await satp.attestations.verify(attestationId);
await satp.attestations.revoke(attestationId);

await satp.reputation.get(identityId);
await satp.reputation.recompute(identityId);

await satp.validation.getLevel(identityId);
await satp.validation.validate(identityId);

await satp.reviews.create(input);
await satp.reviews.getForIdentity(identityId);

await satp.escrow.create(input);
await satp.escrow.fund(escrowId);
await satp.escrow.release(escrowId);
await satp.escrow.refund(escrowId);
```

All transaction-building methods should support wallet-adapter signing in browser and controlled backend/devnet signing where appropriate.

---

## 18. IDL and versioning policy

IDLs are source artifacts for SDK generation.

Rules:

```text
commit generated IDLs under idls/
IDL changes require version bump
program changes require changelog entry
breaking account layout changes require migration notes
SDK types regenerated after IDL changes
AgentFolio must not edit SATP IDLs after extraction
```

Version levels:

```text
0.x
  devnet, unstable, breaking changes allowed with changelog

1.x
  stable public SDK and conformance tests
  breaking changes require major version

mainnet stable
  requires security review, program ID registry, upgrade-authority procedure
```

---

## 19. Network and program configuration

Every environment must define program IDs explicitly.

Target config:

```ts
type SatpNetworkConfig = {
  cluster: 'localnet' | 'devnet' | 'mainnet-beta';
  rpcUrl?: string;
  programs: {
    identityRegistry: string;
    attestations: string;
    reputation: string;
    reviews: string;
    validation: string;
    escrow?: string;
  };
};
```

Program ID registry belongs in:

```text
packages/satp-solana/src/programIds.ts
docs/program-ids.md
Anchor.toml
```

`Anchor.toml` may reference program addresses. It must not reference production private keypaths.

---

## 20. Key management and security

SATP must never commit:

```text
Solana keypair JSON
upgrade authority keypair
program deployer keypair
wallet seed phrase
private key
.env
npm token
RPC provider token
```

Mainnet authority should use:

```text
hardware wallet
multisig
or custody process approved by brainKID and brainShield
```

Before mainnet:

```text
define authority holder
document emergency upgrade process
document freeze/immutability plan
define who can approve upgrade
run verifiable build where possible
```

If programs become immutable, rollback is impossible. That decision requires explicit approval.

---

## 21. Protocol security model

### Attestation trust

The protocol distinguishes:

```text
anyone-issued claim
trusted issuer claim
platform-issued claim
self-issued claim
revoked claim
expired claim
```

Consumers must be able to filter by issuer trust class.

### Replay and spoofing risks

Mitigate:

```text
nonce reuse
signature replay
issuer spoofing
metadata hash mismatch
wallet-link spoofing
duplicate identities
revoked identity usage
```

### Reputation manipulation risks

Threats:

```text
fake reviews
self-dealing identities
Sybil issuers
review farming
escrow wash trading
issuer compromise
formula gaming
```

Mitigations:

```text
issuer trust classes
linked escrow requirements
review weighting
revocation
score formula versioning
anomaly detection by consuming apps
```

### Privacy

Avoid raw sensitive data on-chain.

Use:

```text
hashes
metadata URIs
selective disclosure
off-chain proofs
expiry
revocation
```

---

## 22. Testing strategy

Required tests:

```text
Anchor program tests:
  identity create/update/revoke
  attestation create/revoke/expiry
  review create/revoke
  reputation recompute
  validation level recompute
  escrow create/fund/release/refund

SDK unit tests:
  PDA helpers
  transaction builders
  account decoders
  schema validation
  error mapping

SDK integration tests:
  local validator
  devnet smoke tests

Conformance tests:
  third-party app can resolve identity
  third-party app can verify attestation
  third-party app can recompute/verify trust
  third-party app can show explorer links

Security tests:
  unauthorized issuer rejected where required
  invalid subject rejected
  revoked claims excluded
  expired claims excluded
  duplicate identity rules enforced
  escrow authority rules enforced
```

CI target:

```bash
npm test
npm run build
anchor test
cargo test
gitleaks git --config .gitleaks.toml --redact -v .
```

If Anchor is unavailable in CI, SDK tests still run and Anchor tests are required before release.

---

## 23. Deployment and release process

### Devnet deploy

```bash
anchor build
anchor test
anchor deploy --provider.cluster devnet
npm run generate:idls
npm run build
npm publish --tag dev
```

### Mainnet deploy

Mainnet requires:

```text
brainChain implementation sign-off
brainShield key/security sign-off
brainKID final approval
program IDs recorded
upgrade authority documented
verifiable build or build provenance documented
SDK version tagged
AgentFolio integration tested against deployed program IDs
rollback/emergency plan documented
```

Command shape:

```bash
anchor build --verifiable
anchor deploy --provider.cluster mainnet-beta
anchor verify <PROGRAM_ID>
npm publish --access public
git tag satp-vX.Y.Z
git push origin satp-vX.Y.Z
```

Do not run mainnet deploys from ad hoc local state.

---

## 24. AgentFolio integration contract

AgentFolio integrates through SATP SDK/client only.

AgentFolio may call:

```ts
satp.identity.resolveByWallet(...)
satp.identity.register(...)
satp.attestations.create(...)
satp.attestations.verify(...)
satp.reputation.get(...)
satp.validation.getLevel(...)
satp.reviews.create(...)
satp.escrow.create(...)
satp.escrow.release(...)
```

AgentFolio must not:

```text
copy SATP PDA seed logic into random route handlers
edit SATP IDLs
own SATP program deployment
store SATP private keys
define protocol trust formula internally
```

AgentFolio stores references:

```text
identity id
PDA
transaction signature
attestation id
score snapshot id
validation level
escrow id
```

AgentFolio owns display and marketplace UX.

---

## 25. Third-party integration contract

A third-party platform is SATP-compatible if it can:

```text
resolve a SATP identity
verify wallet ownership or identity linkage
verify attestation validity
check revocation/expiry
read or recompute reputation/validation state
link to Solana explorer transaction signatures
store only references to SATP state
avoid requiring AgentFolio APIs
```

This must be validated through conformance tests.

Target docs:

```text
docs/integration-guide.md
docs/conformance.md
examples/node/
examples/browser/
```

---

## 26. Extraction plan from AgentFolio

Do not copy everything at once.

Recommended sequence:

```text
1. Create SATP ARCHITECTURE.md, SPEC.md, SECURITY.md.
2. Copy IDLs from AgentFolio satp-idls/ into satp/idls/.
3. Copy SATP client from AgentFolio satp-client/ into satp/packages/satp-client/.
4. Create satp-core with shared types and schemas.
5. Create satp-solana with program IDs, PDA helpers, generated IDL clients.
6. Add tests that run without AgentFolio.
7. Build SDK independently.
8. Publish dev package or consume via Git dependency.
9. Add AgentFolio satpAdapter.
10. Refactor AgentFolio to call package APIs only.
11. Remove embedded SATP source-of-truth code from AgentFolio.
12. Keep AgentFolio example integration under examples/agentfolio-adapter/.
```

Order matters. AgentFolio should not delete embedded SATP code until SATP package can build and satisfy the adapter contract.

---

## 27. What must not move into SATP

Do not move:

```text
Next.js frontend
profile pages
directory pages
marketplace pages
job application code
platform-specific review display logic
AgentMail provider implementation
GitHub import UX
AgentFolio database schema
AgentFolio API keys/webhooks
marketing/outreach assets
brainAI HQ code
production PM2 config for AgentFolio
```

SATP may include a small AgentFolio integration example, but not AgentFolio product internals.

---

## 28. Open design decisions before SATP v1

### Program set

Decision required:

```text
one program per module
one core SATP program plus optional escrow
identity/attestation/reputation combined, escrow separate
```

### Upgrade authority

Decision required:

```text
hardware wallet
multisig
governance
immutability after audit
```

### Reputation formula

Decision required:

```text
inputs
weights
issuer trust classes
anti-gaming rules
formula version lifecycle
```

### Escrow dispute process

Decision required:

```text
no disputes in MVP
platform-mediated disputes
arbiter role
multisig release
time-locked refund
```

Do not ship irreversible mainnet escrow semantics until this is resolved.

---

## 29. Definition of done for SATP MVP

SATP MVP is complete when:

```text
1. SATP repo builds independently.
2. IDLs are committed and versioned.
3. SDK resolves identity by wallet.
4. SDK registers or links identity on devnet/localnet.
5. SDK creates/verifies/revokes attestations.
6. SDK reads or computes reputation snapshot.
7. SDK exposes validation level.
8. SDK creates/reads review primitive.
9. Escrow primitive works on devnet or is explicitly out-of-MVP.
10. AgentFolio can use SATP through a package/adapter.
11. Conformance tests prove non-AgentFolio verification.
12. SECURITY.md documents key/authority model.
13. Program IDs are documented by network.
```

---

## 30. Ownership matrix

| Area | Owner | Reviewer |
|---|---|---|
| SATP protocol design | brainChain | brainKID |
| Solana programs | brainChain | brainShield |
| SDK packages | brainChain | brainForge |
| AgentFolio integration | brainForge | brainChain |
| Security/key management | brainShield | brainKID |
| Mainnet deploy approval | brainKID | Hani if business-critical |
| Public protocol messaging | brainGrowth | brainKID |

---

## 31. Architecture decision records

### ADR-001 — SATP is independent from AgentFolio

Status: accepted  
Decision: SATP is a protocol repo and SDK. AgentFolio is first consumer, not owner.  
Reason: SATP must be usable by third-party platforms.

### ADR-002 — SDK-first integration

Status: accepted  
Decision: apps integrate through SDK/client, not direct IDL/PDA duplication.  
Reason: preserves compatibility and reduces app-level protocol drift.

### ADR-003 — Stable package name is `@brainai/satp`

Status: accepted  
Decision: `@brainai/satp` is the target stable package. `@brainai/satp-v3` is temporary migration alias only.  
Reason: public standard package should not carry internal version suffix forever.

### ADR-004 — Hybrid reputation for MVP

Status: proposed  
Decision: store verifiable inputs and selected snapshots; off-chain recomputation for richer scoring.  
Reason: avoids prematurely freezing score formulas on-chain.

### ADR-005 — On-chain minimalism

Status: proposed  
Decision: store identifiers, hashes, references, authorities, and state transitions on-chain; keep large mutable metadata off-chain.  
Reason: lowers cost, protects privacy, improves upgradeability.

### ADR-006 — Mainnet only after conformance

Status: proposed  
Decision: no mainnet-stable SATP release until third-party conformance tests pass.  
Reason: SATP is a standard, not just an AgentFolio integration.

---

## 32. Architecture change checklist

Every SATP PR must answer:

```text
Does this change account layout?
Does this change PDA seeds?
Does this change an IDL?
Does this change package exports?
Does this change program IDs?
Does this change upgrade authority requirements?
Does this change attestation trust semantics?
Does this change revocation/expiry rules?
Does this change reputation formula behavior?
Does this change AgentFolio integration?
Does this require migration instructions?
Does this require SECURITY.md update?
```

If yes, update this file and related docs in the same PR.

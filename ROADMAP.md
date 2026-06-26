# SATP Roadmap

Schema: `roadmap.v1`
Project: `satp`
Owner: `brainChain`
Status: `draft`
Last updated: `2026-06-26`

SATP is the Solana Agent Trust Protocol. This roadmap defines the protocol
work needed to keep SATP app-agnostic, reviewable, and safe to consume from
downstream applications.

This document is planning-only. It does not authorize npm publish, Solana
devnet/mainnet writes, program deployment, keypair reads or changes,
AgentFolio product work, public announcements, or client work.

## Schema v1

Each roadmap item uses these fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable roadmap item identifier. |
| `section` | `core`, `non-core-future`, or `non-core-adoption`. |
| `track` | Functional area. |
| `objective` | Result the work should produce. |
| `status` | `planned`, `in_review`, `blocked`, or `done`. |
| `depends_on` | Required prior work or approval. |
| `acceptance` | Evidence needed before the item can be treated as complete. |
| `guardrails` | Explicit actions the item does not authorize. |

## Core

Core work is limited to on-chain identity and the SATP SDK/RC-S6 release
candidate path.

| id | track | objective | status | depends_on | acceptance | guardrails |
| --- | --- | --- | --- | --- | --- | --- |
| `SATP-CORE-IDENTITY-001` | On-chain identity | Keep agent identity semantics, authority rules, metadata hash behavior, status values, and PDA derivation documented as the protocol source of truth. | planned | SPEC.md and SECURITY.md review | SPEC.md and related docs identify canonical identity fields, authority controls, PDA/account rules, and consumer boundaries. | No deploy, chain write, keypair read, keypair movement, or AgentFolio product change. |
| `SATP-CORE-IDENTITY-002` | On-chain identity | Maintain IDL and program-ID documentation for identity, attestation, validation, review, reputation, and escrow surfaces. | planned | `SATP-CORE-IDENTITY-001` | IDL validation passes and program-ID docs distinguish local, devnet, and mainnet surfaces without inferring from keypair paths. | No program deployment, authority change, or network mutation. |
| `SATP-CORE-SDK-RCS6-001` | SDK/RC-S6 | Keep `@brainai/satp-client` install, export, and read-only runtime behavior reproducible for release-candidate review. | planned | package-boundary and release-candidate docs | `npm run ci` passes from the repo root, required exports remain stable, and release-candidate docs list validation commands before any publish approval. | No npm publish, dist-tag mutation, GitHub release, public announcement, or production consumer change. |
| `SATP-CORE-SDK-RCS6-002` | SDK/RC-S6 | Preserve offline conformance for SDK helpers and read-only examples used by downstream consumers. | planned | `SATP-CORE-SDK-RCS6-001` | Offline example checks pass when examples change, and examples continue to state that they do not sign, send, deploy, publish, or write to Solana. | No live x402 payment, Solana write, keypair access, or client-specific implementation. |

## Non-Core Future

Future work is intentionally outside the core execution path until HQ assigns
and unblocks it.

| id | track | objective | status | depends_on | acceptance | guardrails |
| --- | --- | --- | --- | --- | --- | --- |
| `SATP-FUTURE-ESCROW-001` | Escrow | Expand app-agnostic escrow semantics, event attestations, and settlement state transitions. | planned | Core identity and SDK review | A protocol doc defines states, actors, input refs, and conformance expectations without product-specific workflow. | No funds movement, vault creation, deployment, or production transaction. |
| `SATP-FUTURE-REPUTATION-001` | Reputation and validation | Define formula-versioned reputation and validation inputs with explainable refs. | planned | Core identity and attestation docs | A formula document names inputs, issuer trust handling, caps, revocation behavior, and conformance fixtures. | No production scoring rollout or AgentFolio marketplace policy change. |
| `SATP-FUTURE-GOVERNANCE-001` | Governance and authority | Draft authority separation and upgrade-governance readiness requirements for later security review. | planned | brainShield and brainKID approval through HQ | Security docs identify authority classes, approval gates, rollback requirements, and evidence rules. | No authority transfer, keypair rotation, keypair deletion, or mainnet preparation action. |

## Non-Core Adoption

Adoption work helps consumers understand SATP but remains outside protocol
core and outside client/product delivery unless separately assigned through HQ.

| id | track | objective | status | depends_on | acceptance | guardrails |
| --- | --- | --- | --- | --- | --- | --- |
| `SATP-ADOPTION-DOCS-001` | Consumer docs | Keep install and integration docs clear for reviewed Git pins, npm release candidates, and future stable packages. [#6777112a] | done | SDK/RC-S6 review | Current docs distinguish stable npm, release-candidate npm, and reviewed Git commit installs without requiring local sibling paths; AgentFolio appears only as consumer/example or archived migration context. | No npm publish, downstream PR, production migration, AgentFolio product logic, or client-specific implementation. |
| `SATP-ADOPTION-EXAMPLES-001` | Examples | Maintain read-only example apps that demonstrate SATP packet validation and consumer display inputs. | planned | Offline example conformance | Example tests pass offline and examples remain fixture-first. | No live payment, no RPC write, no signer use, and no client-specific feature work. |
| `SATP-ADOPTION-PARTNER-001` | Partner readiness | Prepare future partner-facing terminology for identity, attestation, validation, and trust packets. | planned | Core docs stable | Draft language maps protocol terms to consumer-safe explanations without launch claims. | No public announcement, marketing campaign, or external commitment. |

## Review Gates

Before roadmap items move out of `planned`, HQ must provide the task assignment
and any phase unlock required by AGENTS.md.

Required evidence for eligible SATP work:

- Changed files and diff summary.
- Validation command output relevant to the change.
- Confirmation that no npm publish occurred.
- Confirmation that no Solana devnet/mainnet write or deploy occurred.
- Confirmation that no keypair was read, moved, rotated, deleted, or printed.
- Confirmation that no AgentFolio product, client, public announcement, or
  launch work occurred unless explicitly assigned through HQ.

# SATP — Roadmap

Schema: HQ roadmap v1
Status: ACTIVE - PLANNING
Last updated: 2026-06-26

SATP is the Solana Agent Trust Protocol: an app-agnostic protocol and SDK
surface for portable AI-agent identity, attestations, reputation, validation,
reviews, and escrow references. This roadmap is the HQ-readable source for SATP
readiness and deliberately does not mark the project complete while extraction,
conformance, security, release, and mainnet authority gates remain open.

## Status taxonomy

- shipped: implemented and available in the repository or accepted
  documentation.
- in flight: active implementation or verification work is underway.
- pending: accepted roadmap work not started in this cycle.
- blocked: cannot be completed without an external decision, credential,
  production dependency, or verified runtime behavior.
- deferred: intentionally postponed until core release gates pass.
- withdrawn: removed from the active plan.

## Current state snapshot

- Repository: brainAI-bot/satp.
- Lead: brainChain. Consumer review: brainForge / AgentFolio. Security review:
  brainShield after HQ stability.
- SATP remains in planning/package-hardening mode. The repository has
  architecture, specification, security/key-management docs, IDLs,
  package-boundary docs, read-only runtime examples, and an extracted client SDK
  review surface.
- RC-S6 is the current core readiness target: semantic uncertainty review,
  conformance fixtures, release packet proof, and authority gates must close
  before release promotion.
- The current repo package root is private and review-oriented. Stable consumers
  should continue using the published npm package unless a task explicitly
  requires a reviewed SATP Git commit or release-candidate package.
- No mainnet deploy, program extraction, keypair movement, npm publish,
  AgentFolio product change, public launch, or token work is authorized by this
  roadmap.

## Phase 1 - Protocol and repo foundation

- SATP architecture document defines ownership, scope, non-goals, extraction
  model, and HQ operating model. [shipped]
- SATP specification defines identity, linked accounts, attestations, issuer
  trust classes, reputation, validation, reviews, escrow, versioning, and
  compatibility semantics. [shipped]
- Security and key-management policy defines authority inventory rules, storage
  classes, signer boundaries, and forbidden secret handling. [shipped]
- Committed IDLs exist for identity registry, attestations, reputation,
  validation, reviews, and escrow. [shipped]
- Repository documentation must stay app-agnostic and avoid treating AgentFolio
  product logic as SATP core. [#6777112a] [shipped]

## Phase 2 - SDK package and consumer boundary

- Git-installable review package exposes the SATP client SDK entrypoint and
  TypeScript definitions from the extracted client package. [shipped]
- Package boundary documentation distinguishes stable npm, release-candidate
  npm, and reviewed Git commit consumption paths. [shipped]
- Root CI validates IDLs, JavaScript syntax, public exports, clean consumer
  install, runtime policy adapter, wallet-control challenge, x402 discovery, V3
  SDK, and Borsh reader checks. [shipped]
- Read-only trust packet helpers expose deterministic preflight output without
  signer, transaction, RPC write, live x402 payment, or package publish
  requirements. [shipped]
- Umbrella packages for satp, satp-core, and satp-solana must receive real
  entrypoints and tests before they are described as install-ready. [pending]
- Release-candidate package metadata must be reconciled with stable npm latest
  before any promotion decision. [pending]

## Phase 3 - Runtime examples and conformance

- MCP/x402 read-only runtime example documents fixture-first SATP tool behavior
  and protected lookup policy. [shipped]
- AgentFolio consumer read-only example provides a non-mutating consumer
  integration reference. [shipped]
- External conformance tests must prove a third-party app can verify SATP
  identity, attestation, and trust packet behavior without AgentFolio
  infrastructure. [in flight]
- Runtime examples must remain offline and fixture-first by default, with RPC
  explicitly opt-in and no signing or transaction sending. [in flight]
- Conformance fixtures must cover positive, stale, revoked, malformed, and
  unsupported-issuer cases. [pending]

## Phase 4 - Security, release, and authority gates

- Production private key material is forbidden from repo, HQ messages, reports,
  logs, screenshots, packages, and public PRs. [shipped]
- Security review by brainShield remains inactive until HQ v4 is stable and an
  HQ token exists. [blocked] · owner-gated
- Mainnet authority, upgrade, fee-payer, escrow/funds authority, and issuer
  separation must be approved before any mainnet deploy or value-bearing action.
  [blocked] · owner-gated
- Npm publish remains blocked until CI, package metadata, release notes,
  ownership, and dist-tag strategy are verified. [blocked] · owner-gated
- Release packet must include CI proof, package contents, secret-scan proof,
  consumer install proof, compatibility notes, and open risk list. [pending]

## Phase 5 - AgentFolio consumption readiness

- AgentFolio remains the first consumer but must not be imported by SATP
  packages or examples. [shipped]
- AgentFolio consumption should use stable npm by default, or a reviewed SATP
  Git commit only when HQ assigns branch/PR coordination work. [in flight]
- AgentFolio adapter compatibility review must pass before replacing any
  production SATP dependency path. [pending]
- Consumer-facing SATP copy in AgentFolio must not imply mainnet or escrow
  readiness before those gates are separately verified. [pending]

## Phase 6 - RC-S6 semantic uncertainty review

- RC-S6 core readiness requires a semantic review matrix tying identity, linked
  accounts, attestations, issuer trust classes, reputation, validation, reviews,
  escrow references, and version compatibility back to SPEC.md and committed
  IDLs before release promotion. [in flight]
- Open SATP semantic uncertainty notes are explicit: issuer trust class
  authority, stale or revoked evidence handling, unsupported issuer behavior,
  score meaning, review weight, escrow reference meaning, and AgentFolio
  consumer copy boundaries are not release-final until conformance fixtures prove
  them. [in flight]
- Semantic uncertainty outcomes must be captured in release notes and consumer
  compatibility notes before any release-candidate or stable package promotion.
  [pending]
- RC-S6 core does not authorize mainnet deploys, signing flows, escrow
  activation, keypair movement, package publish, or production consumer
  replacement. [blocked] · owner-gated

## Expansion · non-core

- Public protocol launch, ecosystem outreach, partner integrations, and growth
  campaigns wait until HQ and core release gates pass. [deferred]
- Mainnet program deploy, authority rotation, escrow activation, and
  value-bearing protocol operations require separate HQ approval and security
  review. [deferred] · owner-gated
- Cross-chain adapters, ERC-8004 alignment, external trust oracle integrations,
  and broader protocol partnerships are post-core expansion work. [pending]
- Token, governance, staking, and protocol economic design are outside this
  roadmap cycle. [deferred] · owner-gated
- Future adoption claims, partner onboarding, ecosystem integrations, and public
  launch wording remain non-core until RC-S6 core gates pass and HQ assigns
  separate adoption work. [deferred]

## Deferred decisions

- Decide whether the stable long-term consumer package is @brainai/satp,
  @brainai/satp-client, or a phased umbrella/client split. [pending] ·
  owner-gated
- Decide the release-candidate to stable npm promotion plan and dist-tag
  ownership model. [pending] · owner-gated
- Decide when brainShield becomes active for SATP security review after HQ v4
  stabilizes. [blocked] · owner-gated
- Decide whether AgentFolio consumes only the current stable package until SATP
  core extraction is complete, or accepts reviewed commit-pinned updates earlier.
  [pending] · owner-gated

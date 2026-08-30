# SATP — Roadmap

Schema: HQ roadmap v1
Status: ACTIVE - PLANNING
Last updated: 2026-08-30

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
- blocked: waiting on a NON-fleet actor only — an Owner decision or signature,
  an external credential/account, or a third party. Blocked items carry
  · owner-gated (or name the external wait). Any work the fleet can do before
  a gate is its own pending item placed before it (litmus test: if the Owner
  said yes right now, could the fleet act immediately?). Convention:
  brainAI-bot/hq docs/ROADMAP_AUTHORING.md.
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
- Issue #14 npm consume correction: npm registry readback on 2026-08-02 shows
  `@brainai/satp-client@2.0.6` is the current stable `latest` package, published
  at `2026-08-02T13:17:15.867Z` and modified at `2026-08-02T13:17:16.039Z`.
  AgentFolio and stable consumers should verify against `@brainai/satp-client`
  or exact `@brainai/satp-client@2.0.6` under the stable-channel behavior
  recorded in package-boundary docs, unless HQ assigns historical rc evidence or
  reviewed Git commit work. Owner-approved `REQ-6b35eb58` is the 2.0.6
  roadmap-gate approval authority; HQ task
  `SATP-NPM-PUBLISH-APPROVAL-EFFECTIVE-20260802` records the 2.0.6
  publish/readback execution. Owner-approved `REQ-cc84fa3a` and PR #115 remain
  the historical stable-line / 2.0.2 public provenance. This supersedes older
  roadmap wording that named `2.0.1`, `2.0.2`, `2.0.3`, or `2.0.5` as current
  stable/latest state, without authorizing Solana writes, keypair movement, npm
  dist-tag changes, new npm publishing, AgentFolio product changes, or public
  launch.
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
  validation, reviews, and escrow. `idls/v3/escrow_v3.json` is the canonical
  14-instruction interface generated from the source commit whose pinned SBF
  build matches the mainnet program
  `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` prefix byte-for-byte. The
  remaining loader allocation is proven zero padding. The legacy Anchor IDL is
  stale at 9 instructions, while the 14-instruction Program Metadata IDL omits
  the treasury account on both SOL release routes; neither is canonical.
  [shipped]
- Repository documentation must stay app-agnostic and avoid treating AgentFolio
  product logic as SATP core. [#6777112a] [shipped]
- Apache-2.0 LICENSE file present at repo root with package.json license set to
  match, per the locked license decision. [#638f976b] [shipped]
- Program source for all 6 V3 Anchor programs extracted from clawd-brainchain
  into this repo under programs/ after a secret/agent-memory scrub, so third
  parties can inspect the open-core source independently (ARCHITECTURE section
  5 mandate; approved 2026-07-06). [#3faa5445] [shipped]
- cfg-bound source-identity gates record reviewed source packages. Mainnet
  escrow source commit `3f8188bec89db0d4a081931f35272e10185d1c0d` now has a
  reproducible byte-for-byte prefix match to deployed ProgramData with explicit
  zero-padding proof; other program and
  network source-to-chain claims remain evidence-only until separately proven.
  [#3faa5445] [#6c477338] [shipped]

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
  entrypoints and tests before they are described as install-ready. [#bd0618ef] [shipped]
- Release-candidate package metadata must be reconciled with stable npm latest
  before any promotion decision. [#7ae6b71d] [shipped]
- Issue #14 runtime SDK ergonomics slice: offline identity-attestation request
  verification and repo-owned AgentFolio reference-consumer adoption landed in
  PR #147 at merge commit `240dba99dc4e555e9dd221d93f76f2726bd8159e`.
  [#14] [shipped]

## Phase 3 - Runtime examples and conformance

- MCP/x402 read-only runtime example documents fixture-first SATP tool behavior
  and protected lookup policy. [shipped]
- AgentFolio consumer read-only example provides a non-mutating consumer
  integration reference. [shipped]
- External conformance tests must prove a third-party app can verify SATP
  identity, attestation, and trust packet behavior without AgentFolio
  infrastructure. [#f5421e4b] [shipped]
- Runtime examples must remain offline and fixture-first by default, with RPC
  explicitly opt-in and no signing or transaction sending. [#580c45a5] [shipped]
- Conformance fixtures must cover positive, stale, revoked, malformed, and
  unsupported-issuer cases. [#10ef9615] [shipped]

## Phase 4 - Security, release, and authority gates

- Production private key material is forbidden from repo, HQ messages, reports,
  logs, screenshots, packages, and public PRs. [shipped]
- Security review by brainShield is driven through HQ tasking once tokened, with
  independent evidence required before release promotion. [#feb0ea11] [shipped]
- brainShield independent review of the mainnet-authority readiness doc was
  delivered by SATP-MAINNET-AUTHORITY-INDEPENDENT-BRAINSHIELD-20260707 on
  2026-07-06, with cross-host-auditable evidence independent of the brainForge
  builder-domain review. [#dd682623] [shipped]
- Assemble the single Owner mainnet-authority decision packet: public authority
  inventory, upgrade-custody choice, fee-payer separation, issuer registry and
  trust-class boundary, escrow/funds authority and dispute model,
  emergency/freeze plan, and the conformance/build evidence. [#6c8a5545] [shipped]
- Upgrade-custody DECISION (Owner, 2026-07-06): the single upgrade-authority key remains a SOLE Owner-held key
  — NO multisig and no agent co-signer (the audits' multisig reco is declined; risk-accepted). This resolves
  the packet's upgrade-custody question. [#71a5c329] [shipped]
- Mainnet authority, upgrade, fee-payer, escrow/funds authority, and issuer
  separation: Owner approved the decision-packet close via REQ-95b3cba7.
  Mainnet deploys, value-bearing actions, keypair use, npm publish, and
  production key actions still require separate explicit approval. [#e0556f1f] [shipped]
- Verify npm publish readiness with evidence in the release packet: CI proof,
  package metadata, release notes, ownership, and dist-tag strategy. [#d7b0e5f9] [shipped]
- Npm publish itself: executed for `@brainai/satp-client@2.0.6` under
  Owner-approved `REQ-6b35eb58`; any future package publish action still waits
  on separate Owner npm publish approval. [#9291bc59] [shipped]
- Release packet must include CI proof, package contents, secret-scan proof,
  consumer install proof, compatibility notes, and open risk list. [#3611a94d] [shipped]

## Phase 5 - AgentFolio consumption readiness

- AgentFolio remains the first consumer but must not be imported by SATP
  packages or examples. [shipped]
- AgentFolio consumption should use stable npm by default, or a reviewed SATP
  Git commit only when HQ assigns branch/PR coordination work. [#eb22998c] [shipped]
- AgentFolio adapter compatibility review must pass before replacing any
  production SATP dependency path. [#204cd91f] [shipped]
- Consumer-facing SATP copy in AgentFolio must not imply mainnet or escrow
  readiness before those gates are separately verified. [#53ffa5e3] [shipped]
- Consumer escrow remains disabled: the mainnet program bytes match pinned
  source commit `3f8188bec89db0d4a081931f35272e10185d1c0d`, and fee routing is
  deployed, but neither published IDL is canonical. The legacy Anchor IDL has 9
  instructions; the Program Metadata IDL has 14 but omits `treasury` from
  `release` and `partial_release`. Unpause requires canonical IDL publication
  reconciliation and independent consumer verification.
  [#926b9931] [blocked] · owner-gated

## Phase 6 - RC-S6 semantic uncertainty review

- RC-S6 core readiness requires a semantic review matrix tying identity, linked
  accounts, attestations, issuer trust classes, reputation, validation, reviews,
  escrow references, and version compatibility back to SPEC.md and committed
  IDLs before release promotion. [#0da97436] [shipped]
- Open SATP semantic uncertainty notes are explicit: issuer trust class
  authority, stale or revoked evidence handling, unsupported issuer behavior,
  score meaning, review weight, escrow reference meaning, and AgentFolio
  consumer copy boundaries are not release-final until conformance fixtures prove
  them. [#43394290] [shipped]
- Semantic uncertainty outcomes must be captured in release notes and consumer
  compatibility notes before any release-candidate or stable package promotion.
  [#3653fd5a] [shipped]
- INVARIANT: RC-S6 core does not authorize mainnet deploys, signing flows,
  escrow activation, keypair movement, package publish, or production consumer
  replacement. [#26179beb] [shipped]

## Phase 7 - On-chain program completion (open-core)

- V3 IDLs are committed under `idls/v3/`; escrow is pinned there to the verified
  deployed-source interface. CI validates the generated tree and the
  deployed-source provenance packet. [#c5634a2c] [shipped]
- USDC escrow support in the escrow program and dual-currency SDK builders (SPL
  vault PDA, ATAs, transfer_checked); SOL-first is fine to launch, USDC is v2.
  [#14fa5837] [shipped]
- Escrow SOL fee-routing and the five USDC/SPL entrypoints are deployed and
  source/binary provenance passes. Consumer escrow unpause remains false until
  the canonical Program Metadata IDL is reconciled and independently verified.
  [#926b9931] [blocked] · owner-gated
- The S7/AF18 USDC program-layer rider is included in the reproducible
  fee-routing candidate packet at commit `3f8188bec89db0d4a081931f35272e10185d1c0d`.
  Its five SPL routes are present in the deployed runtime, but none is
  represented as consumer-active until canonical IDL publication and
  independent post-publication verification complete. [#926b9931] [blocked] · owner-gated
- D1 SDK wiring: V3_MAINNET_PROGRAM_IDS populated behind the approved
  mainnet-authority decision packet. [#bd298672] [shipped]
- Published-client V2 mainnet fence remains open until the client is
  republished after the fence PR merges; no npm publish is authorized by this
  roadmap item. [#a8e875a7] [shipped]
- Burn-to-Become verified end-to-end on devnet against the deployed identity
  program: free mint, the 3-per-identity cap enforced on-chain, wallet rotation
  carrying the cap, and a soulbound transfer that fails. [#fbc35f6e] [shipped]

- FINAL hardening (Owner-approved 2026-07-06, sequenced LAST — do only after all core work): separate the
  low-privilege OPERATIONAL signer (fee-payer / test / attestation, agent-holdable, cannot upgrade programs)
  from the sole Owner-held upgrade-authority key, so routine traffic never touches the key that can rewrite
  program logic. No authority transfer, no multisig; the Owner provisions one new low-priv key. [#c749448f] [shipped]

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
  @brainai/satp-client, or a phased umbrella/client split. [#b3e7e7ce] [shipped]
- Decide the release-candidate to stable npm promotion plan and dist-tag
  ownership model. [#c6ac139d] [shipped]
- Decide when brainShield becomes active for SATP security review after HQ v4
  stabilizes. [#4d07e4ce] [shipped]
- AgentFolio consumption policy is stable npm by default; reviewed
  commit-pinned updates are allowed only when HQ assigns explicit branch/PR
  coordination work. This closes the duplicate deferred decision in favor of the
  shipped Phase 5 consumer-boundary policy. [#4a8988f4] [shipped]

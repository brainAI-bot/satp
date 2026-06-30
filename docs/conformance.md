# SATP RC-S6 Conformance Fixture Test Plan

Status: executable fixture suite added for RC-S6 review

This plan defines the fixture-first conformance gate for RC-S6. It proves that a
third-party consumer can verify SATP identity, linked accounts, attestations,
trust packets, and failure cases without AgentFolio infrastructure.

This plan does not authorize extraction work, Solana devnet/mainnet writes,
signing flows, keypair reads, package publishing, AgentFolio product changes,
public launch work, or token work.

## Goals

- Prove SATP consumers can verify committed fixture records with only SATP
  SDK/helpers, IDLs, and documented schemas.
- Cover the minimum RC-S6 semantic uncertainty cases: positive, stale, revoked,
  malformed, and unsupported-issuer records.
- Keep conformance runnable offline by default with no credentials, RPC writes,
  live x402 payment, deploy, publish, or production dependency.
- Produce review evidence that can be included in the RC-S6 release packet.

## Fixture Set

The executable conformance suite keeps fixtures under
`tests/conformance/fixtures/` and treats those files as the review artifact.

| Fixture | Expected verdict | Purpose |
| --- | --- | --- |
| `identity-positive.json` | pass | Valid identity record with matching wallet, agent ID hash, Genesis PDA, network, and schema version. |
| `linked-account-positive.json` | pass | Valid linked account proof that is bound to the same SATP identity subject. |
| `attestation-positive.json` | pass | Valid attestation with supported claim type, issuer trust class, metadata hash, PDA, and non-expired validity window. |
| `trust-packet-positive.json` | pass | Valid offline read-only trust packet generated from deterministic SDK helpers. |
| `identity-stale.json` | fail closed | Previously valid identity whose freshness window or compatibility version is no longer acceptable. |
| `attestation-revoked.json` | fail closed | Attestation marked revoked by fixture state or revocation reference. |
| `attestation-malformed.json` | fail closed | Record with missing required fields, invalid PDA/hash linkage, or invalid schema version. |
| `issuer-unsupported.json` | fail closed | Structurally valid record from an issuer trust class that RC-S6 does not support. |
| `review-weight-boundary.json` | deterministic warning or fail closed | Review/reputation input that reaches an uncertainty boundary without silently inflating trust. |
| `escrow-reference-boundary.json` | deterministic warning or fail closed | Escrow reference fixture that proves RC-S6 does not imply escrow activation or value-bearing readiness. |

## Conformance Assertions

Executable tests should assert:

1. Positive fixtures validate with deterministic output and no network access.
2. Stale, revoked, malformed, and unsupported-issuer fixtures fail closed.
3. PDA, agent ID hash, metadata hash, schema version, network, and issuer trust
   class checks are explicit in verdict details.
4. Trust packet validation preserves read-only flags and rejects signer,
   transaction, RPC write, live x402 payment, deploy, and publish indicators.
5. Reputation, validation, review, and escrow reference fixtures cannot be
   promoted into release-ready semantics unless their RC-S6 uncertainty status
   is explicit.
6. Consumer examples can load conformance fixtures without importing AgentFolio
   product code or depending on AgentFolio APIs.

## RC-S6 Semantic Uncertainty Review Matrix

Source marker: `[#0da97436]`

This matrix is the reviewer-facing semantic gate for RC-S6. It keeps consumer
behavior deterministic when SATP records are structurally readable but their
trust meaning is not yet release-approved.

| Review surface | Positive semantic signal | Uncertainty state | Required downgrade or skip behavior | Consumer-facing impact |
| --- | --- | --- | --- | --- |
| Identity record | Active devnet identity with matching agent ID hash, Genesis PDA, authority, primary wallet, metadata hash, schema version, network, and freshness window. | Missing or mismatched subject linkage, stale freshness, inactive status, unsupported schema compatibility, or non-devnet fixture context. | Fail closed for identity verification; do not infer identity from wallet, display name, cached AgentFolio data, or partial PDA matches. | Consumers must show the agent as unverified or unavailable for SATP-gated actions and must not promote trust score, capability, or payment readiness from the record. |
| Linked account | Enabled linked account proof bound to the same SATP identity subject with supported account kind, issuer, issuer trust class, proof hash, PDA, network, and freshness checks. | Account reference is valid-looking but not bound to the subject identity, is disabled, stale, unsupported, or carries an issuer class outside the RC-S6 allowlist. | Skip the linked account as evidence; fail closed if the consumer action requires that linked account, and never use it to repair or replace a failed identity record. | Consumers may display the account as not verified for this agent and must not unlock wallet-scoped claims, reputation import, or cross-account privileges from it. |
| Attestation | Non-revoked attestation with supported canonical claim type, issuer trust class, evidence hash, metadata hash, attestation PDA, subject wallet, network, and validity window. | Revoked, expired, malformed, unsupported claim type, unsupported issuer class, mismatched subject, or unclear issuer authority. | Fail closed for the individual attestation; ignore it for aggregation and do not translate it into capability, review, risk, or work-history credit. | Consumers must omit the claim from verified badges, trust summaries, and policy decisions, or show it as unavailable/rejected when explanation UI is required. |
| Issuer trust class | Issuer class is one of the RC-S6 supported classes: `self`, `platform`, `protocol`, `partner`, or `security`. | Structurally valid issuer uses any other class, issuer authority cannot be resolved from the fixture, or class semantics are ambiguous for the claim. | Treat the issuer as unsupported; fail closed for records whose trust meaning depends on that issuer class, even when hashes and PDAs validate. | Consumers must not convert unsupported issuer evidence into verified identity, linked account, reputation, risk, or capability signals. |
| Review or reputation input | Boundary fixture produces deterministic warning or fail-closed output without silently inflating score meaning. | Review weight, score scale, reviewer authority, or aggregation semantics are not release-approved. | Downgrade to warning or fail closed; do not add to release-ready score, ranking, eligibility, or trust packet promotion. | Consumers may surface the item only as uncertain review evidence and must keep trust score, ordering, and eligibility unchanged unless separately approved. |
| Escrow or value reference | Escrow reference is explicitly marked as a boundary fixture and contains no signer, transaction, RPC write, live payment, deploy, publish, keypair, or secret indicator. | Escrow status, value movement, or payment readiness is implied rather than directly proven by an approved live flow. | Skip value-bearing interpretation; reject any mutation indicator and keep the fixture read-only. | Consumers must not show funds as locked, released, payable, claimable, or production-ready from RC-S6 conformance evidence alone. |
| Trust packet consumption | Offline trust packet validates read-only SATP identity and evidence references with mutation indicators absent. | Packet includes signer, transaction, RPC write, live x402 payment, deploy, publish, keypair, secret, stale evidence, or unsupported issuer semantics. | Reject the packet or downgrade to a warning that cannot unlock protected actions. | Consumers must keep protected actions gated by local policy; SATP evidence may inform policy but must not bypass host approval or payment authorization. |

## Test Layout

The executable gate is offline and does not change this phase's non-actions:

```text
tests/conformance/
  fixtures/
    identity-positive.json
    linked-account-positive.json
    attestation-positive.json
    trust-packet-positive.json
    identity-stale.json
    attestation-revoked.json
    attestation-malformed.json
    issuer-unsupported.json
    review-weight-boundary.json
    escrow-reference-boundary.json
  rc-s6-fixtures.test.js
```

Run the conformance gate directly:

```bash
npm run test:conformance:rc-s6
```

The root offline CI now includes this gate through `npm run ci`. The expanded
example gate `npm run ci:offline-with-examples` also runs it because that
command starts with `npm run ci`.

## Evidence Required For RC-S6

An RC-S6 conformance evidence packet should include:

- `git diff --stat` for fixture and test files.
- The exact offline command used to run conformance tests.
- Passing output for root CI and the conformance gate.
- Confirmation of no deploy, no keypair access, no package publish, no
  AgentFolio product change, no public launch, and no token work.
- A table mapping each fixture verdict to the corresponding `SPEC.md` and IDL
  requirement.
- Remaining uncertainty notes for issuer authority, stale/revoked evidence,
  unsupported issuers, score meaning, review weight, escrow references, and
  AgentFolio consumer copy boundaries.

## Current RC-S6 Status

The executable fixture suite is present under `tests/conformance/` and wired
to the offline CI path. Remaining RC-S6 release review should still treat issuer
authority, stale/revoked evidence, unsupported issuers, score meaning, review
weight, escrow references, and AgentFolio consumer copy boundaries as explicit
uncertainty areas until separate release approval closes them.

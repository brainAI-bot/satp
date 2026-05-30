# SATP RC-S6 Conformance Fixture Test Plan

Status: draft for RC-S6 review

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

The future executable conformance suite should keep fixtures under
`tests/conformance/fixtures/` and treat those files as the review artifact.

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

## Proposed Test Layout

Future implementation PRs should add the executable gate without changing this
phase's non-actions:

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

The test runner should be wired to a new offline npm script, then included in
`npm run ci:offline-with-examples` only after the fixtures and assertions are
reviewed.

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

This document is the test plan only. The executable fixture suite remains
pending until HQ assigns implementation work for `tests/conformance/`.

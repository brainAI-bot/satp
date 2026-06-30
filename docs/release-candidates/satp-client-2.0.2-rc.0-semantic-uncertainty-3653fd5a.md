# @brainai/satp-client 2.0.2-rc.0 Semantic Uncertainty Notes [#3653fd5a]

Status: release-note and consumer-compatibility documentation only. This note
does not approve npm publish, npm dist-tag mutation, Solana devnet/mainnet
writes, keypair changes, signing, production deploys or restarts,
credential/admin/DNS/GitHub org mutations, paid spend, public launch actions,
client commitments, Masthead work, or AgentFolio product changes.

## Release Note

RC-S6 now carries executable semantic uncertainty coverage for SATP consumers.
The merged fixture/conformance work in `93db1b3` (`Add RC-S6 semantic
uncertainty conformance fixtures [#43394290]`, PR #53) added the offline
`tests/conformance/rc-s6-fixtures.test.js` gate and the reviewed fixture set
under `tests/conformance/fixtures/`. The follow-up marker `a0252e8` (`Mark
RC-S6 semantic uncertainty shipped [#43394290]`) records that the fixture work
is present on `main`.

The fixtures cover positive identity, linked account, attestation, and trust
packet records, plus stale identity, revoked attestation, malformed record,
unsupported issuer, score meaning, review weight, escrow reference, and
AgentFolio consumer-copy boundaries. These outcomes are deterministic and
offline; they do not imply live network authority, production escrow readiness,
payment readiness, or npm promotion.

## Consumer Compatibility Notes

- Consumers should treat RC-S6 conformance as a read-only compatibility signal:
  records may be parsed and validated offline, but host applications still own
  policy decisions and protected-action gates.
- Positive fixtures prove deterministic SDK/schema compatibility for the
  reviewed RC-S6 artifact. They do not prove mainnet availability, live issuer
  registry authority, live payment handling, escrow activation, or production
  launch readiness.
- Stale, revoked, malformed, unsupported-issuer, score-meaning, review-weight,
  escrow-reference, and AgentFolio copy-boundary fixtures must remain warning or
  fail-closed outcomes. Consumers must not convert them into verified badges,
  ranking, eligibility, trust-score promotion, payment state, or protected
  action access.
- Stable consumer installs should remain on `@brainai/satp-client@2.0.1` unless
  a separate promotion decision approves the RC artifact. RC validation should
  use exact `@brainai/satp-client@2.0.2-rc.0` metadata after promotion, or a
  reviewed SATP Git commit only for HQ-assigned PR coordination.
- AgentFolio remains a downstream consumer. RC-S6 conformance evidence must not
  alter AgentFolio launch state, dependency policy, marketplace escrow policy,
  product code, payment handling, or customer commitments.

## Evidence To Recheck Before Promotion

Run these read-only checks before any later release-candidate or stable package
promotion review:

```sh
npm run test:conformance:rc-s6
npm run check:release-metadata
npm run check:satp-client-health
npm run smoke:consumer-install
npm run ci
```

The commands are intended to operate on local files and temporary local package
artifacts only. They must not publish to npm, mutate dist-tags, deploy programs,
read or change keypairs, write Solana state, change production, or perform
public launch work.

## Guardrail Readback

This documentation packet changed release notes and consumer compatibility
guidance only. It did not edit `ROADMAP.md` and did not perform publishing,
deployment, keypair, signing, admin, spend, public launch, client, Masthead, or
AgentFolio product actions.

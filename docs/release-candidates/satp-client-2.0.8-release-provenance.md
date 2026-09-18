# @brainai/satp-client 2.0.8 Release Provenance

Status: published and verified. This is the repository-grounded provenance
artifact for the release-state correction tracked by GitHub issue #14 and HQ
task `TASK-74298306`. It records an already completed release; it does not
approve or perform another npm publish, npm dist-tag mutation, Solana write,
keypair action, credential/admin action, deploy, production restart, public
launch, paid spend, or client commitment.

## Canonical readbacks

The following independently address source review, repository integration, and
registry delivery:

- npm package: `@brainai/satp-client@2.0.8`
- npm `latest`: `2.0.8`
- npm publish time: `2026-08-29T18:06:11.408Z`
- source/release PR: [#164](https://github.com/brainAI-bot/satp/pull/164)
- reviewed PR head: `893a47f7cbfd5035b5095f401153ac7e3ccbbaa1`
- merge commit on `main`: `250f59c792ff50e185163e4454f4d6982468151b`
- release source commit: `25aa48ca646f628e186692e567d048d1027ba7df`
- release source tree: `cd8ed9518287553986baf5eb64f8a367c0e48d2f`
- Owner-approved publish/readback task: `TASK-09243114` (`passed`)

The registry publish/readback task preserved this artifact evidence:

- tarball: `https://registry.npmjs.org/@brainai/satp-client/-/satp-client-2.0.8.tgz`
- integrity: `sha512-EuPNCPODD8VH5qPnSrAoaaIPVjkrfRjk97Czkbv88F3iHwlITpzGvgFfbkVjB2rLfExkjfm0Ge8v6YHisVA9jA==`
- shasum: `e98f5073a1637fe3424311e42f48719de6fee941`
- packed surface: 28 files
- clean consumer install/load: succeeded with 119 CommonJS exports

## Roadmap and issue boundary

This artifact supersedes repository or issue text that calls `2.0.6` the
current npm `latest`. It deliberately does not edit `ROADMAP.md`: the roadmap
correction is a separate, markdown-only follow-up after this provenance PR is
merged and independently reviewed at its current head. GitHub issue #14 remains
the roadmap epic; the two linked PRs, not issue comments, provide the delivery
record.

Future npm publishes and dist-tag changes remain separately gated. No release,
chain, deployment, credential, or permission mutation is implied by this
read-only reconciliation.

## Reproduction

Read-only registry verification:

```sh
npm view @brainai/satp-client dist-tags time --json
```

Repository consistency verification:

```sh
npm run check:release-metadata
```

The fixture `tests/fixtures/satp-client-release-metadata.json` binds the source
commit/tree, PR and merge commit, registry publish timestamp, and passed HQ task
to the local `2.0.8` package metadata.
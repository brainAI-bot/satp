# @brainai/satp-client 2.0.8 Release Provenance

Status: published; registry state verified; source divergence remains open.
This is the repository-grounded provenance artifact for the release-state
correction tracked by GitHub issue #14 and HQ task `TASK-74298306`. It records
an already completed release and the gap discovered during reconciliation; it
does not approve or perform another npm publish, npm dist-tag mutation, Solana write,
keypair action, credential/admin action, deploy, production restart, public
launch, paid spend, or client commitment.

## Canonical readbacks

The following are separate facts. They do not form a single linear
review-merge-publish chain:

- npm package: `@brainai/satp-client@2.0.8`
- npm `latest`: `2.0.8`
- npm publish time: `2026-08-29T18:06:11.408Z`
- release PR: [#164](https://github.com/brainAI-bot/satp/pull/164)
- reviewed PR head: `893a47f7cbfd5035b5095f401153ac7e3ccbbaa1`
- merge commit on `main`: `250f59c792ff50e185163e4454f4d6982468151b`
- release source commit: `25aa48ca646f628e186692e567d048d1027ba7df`
- release source tree: `cd8ed9518287553986baf5eb64f8a367c0e48d2f`
- release source package tree: `7946852afdc61710a00e553f0ff6d93888e99203`
- reviewed/merged package tree: `1d03baa9466dd5dabaeee3ea704bbe4dbc6c79c6`
- Owner-approved publish/readback task: `TASK-09243114` (`passed`)

The release source commit is **not** on `main` and is **not** an ancestor of the
merge commit. It is the pre-rebase commit with parent `079f2a85ad912d4eff2bca5516d214829246784b`.
Its root tree was review-anchored indirectly in
[PR #164 R2](https://github.com/brainAI-bot/satp/pull/164#pullrequestreview-5058023363):
the independent reviewer approved head `893a47f7...` after verifying the pinned
commit, expected root tree, and construction receipt. No review was submitted
directly at `25aa48ca...`, and PR #164's reviewed head must not be presented as
the content head that npm published.

The registry publish/readback task preserved this artifact evidence:

- tarball: `https://registry.npmjs.org/@brainai/satp-client/-/satp-client-2.0.8.tgz`
- integrity: `sha512-EuPNCPODD8VH5qPnSrAoaaIPVjkrfRjk97Czkbv88F3iHwlITpzGvgFfbkVjB2rLfExkjfm0Ge8v6YHisVA9jA==`
- shasum: `e98f5073a1637fe3424311e42f48719de6fee941`
- packed surface: 28 files
- clean consumer install/load: succeeded with 119 CommonJS exports

## Open source divergence

The npm package and the package tree merged by PR #164 are different source
surfaces carrying version `2.0.8`. The published package tree lacks changes that
exist in the reviewed/merged package tree, including:

- the `./attestation-evidence` export and `src/attestation-evidence.js`; and
- `V3_ESCROW_PLATFORM_TREASURY` plus `validateFixedTreasuryOption` in
  `src/v3-sdk.js`.

Therefore `@brainai/satp-client@2.0.8` from npm must not be described as
equivalent to the `2.0.8` package source on current `main`. Closing this gap
requires either a separately approved future package version from reviewed,
main-compatible source (for example `2.0.9`) or an explicit documented
acceptance of the divergence. A future publish remains Owner-gated. This PR
records the open item and performs no publish or acceptance decision.

## Roadmap and issue boundary

This artifact supersedes repository or issue text that calls `2.0.6` the
current npm `latest`. It deliberately does not edit `ROADMAP.md`: the roadmap
correction is a separate, markdown-only follow-up after this provenance PR is
merged and independently reviewed at its current head. GitHub issue #14 remains
the roadmap epic; the two linked PRs, not issue comments, provide the delivery
record.

The follow-up may state that npm `latest` is `2.0.8`, but it must not state or
imply that npm `2.0.8` equals the package source on `main`. It must preserve the
open divergence and separately gated future-publish boundary.

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

The fixture `tests/fixtures/satp-client-release-metadata.json` records the source
commit/tree, PR and merge commit, distinct package trees, registry publish
timestamp, passed HQ task, indirect review anchor, and open divergence. The
checker validates that this is represented as a non-ancestor, non-equivalent,
unresolved release rather than treating matching constants as external proof.

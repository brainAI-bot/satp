# @brainai/satp-client 2.0.6 Source Release Prep

Status: source-side release-ready semver prep followed by the separately
Owner-approved 2.0.6 npm publish/readback. Owner-approved approval record
`REQ-cc84fa3a` and PR #115 are the publicly auditable approval provenance for
the stable package line; HQ task `SATP-NPM-PUBLISH-APPROVAL-EFFECTIVE-20260802`
records the 2.0.6 publish/readback. This note does not approve or perform
another npm publish, npm dist-tag mutation, Solana write, keypair action,
credential/admin action, deploy, production restart, public announcement, paid
spend, or client commitment.

## Pre-Publish Registry Readback

Checked at: `2026-08-02T12:10Z`

Non-mutating command:

```sh
npm view @brainai/satp-client version versions --json
```

Readback:

- `latest`: `2.0.5`
- `versions`: `0.1.0-rc.0`, `2.0.0`, `2.0.1`, `2.0.2`, `2.0.3`, `2.0.4`, `2.0.5`

## Post-Publish Registry Readback

Checked at: `2026-08-02T13:17Z`

Readback from the approved publish cycle:

- `latest`: `2.0.6`
- `rc`: `2.0.2`
- `published`: `2026-08-02T13:17:15.867Z`
- `modified`: `2026-08-02T13:17:16.039Z`

## Semver Selection

The selected release-ready source version was `2.0.6`, which is now the stable
npm `latest` package after the approved publish/readback.

The pre-publish source-prep decision followed the package history because the
stable line had advanced by patch releases from `2.0.0` through `2.0.5`, and
`2.0.5` was already the npm `latest` version at `2026-08-02T12:10Z`. Since npm
package versions are immutable, the approved publish used a new version greater
than that pre-publish stable package.

## Source Prep

- `packages/satp-client/package.json` is advanced to `2.0.6`.
- Workspace packages that depend on `@brainai/satp-client` are pinned to
  `2.0.6` for source review.
- Lockfiles are refreshed for the same package metadata.
- Release metadata records npm `latest` as `2.0.6` after the approved
  publish/readback.

## Required Local Evidence

Run from the repository root before PR delivery:

```sh
npm pkg get version --prefix packages/satp-client
npm pack --dry-run --json ./packages/satp-client
npm audit --omit=dev
npm run check:satp-client-health
npm run check:release-metadata
node -e "const satp=require('./packages/satp-client/src'); console.log(typeof satp.createSATPClient, typeof satp.SATPV3SDK)"
```

The commands above are local or registry read-only checks. They must not publish
to npm, move npm tags, write Solana state, deploy, restart production, read or
change keypairs, rotate credentials, spend funds, make public launch claims, or
create client commitments.

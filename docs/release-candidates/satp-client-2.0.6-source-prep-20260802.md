# @brainai/satp-client 2.0.6 Source Release Prep

Status: source-side release-ready semver prep only. This note does not approve
or perform an npm publish, npm dist-tag mutation, Solana write, keypair action,
credential/admin action, deploy, production restart, public announcement, paid
spend, or client commitment.

## Registry Readback

Checked at: `2026-08-02T12:10Z`

Non-mutating command:

```sh
npm view @brainai/satp-client version versions --json
```

Readback:

- `latest`: `2.0.5`
- `versions`: `0.1.0-rc.0`, `2.0.0`, `2.0.1`, `2.0.2`, `2.0.3`, `2.0.4`, `2.0.5`

## Semver Selection

The next release-ready source candidate is `2.0.6`.

This follows the published package history because the stable line has advanced
by patch releases from `2.0.0` through `2.0.5`, and `2.0.5` is already the npm
`latest` version. Since npm package versions are immutable, a valid future
publish must use a new version greater than the current stable package.

## Source Prep

- `packages/satp-client/package.json` is advanced to `2.0.6`.
- Workspace packages that depend on `@brainai/satp-client` are pinned to
  `2.0.6` for source review.
- Lockfiles are refreshed for the same package metadata.
- Release metadata records npm `latest` as `2.0.5` and the unpublished next
  candidate as `2.0.6`.

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

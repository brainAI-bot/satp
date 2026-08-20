# @brainai/satp-client 2.0.7 Source Release Candidate

Status: source-side patch release candidate only. This note does not approve or
perform an npm publish, npm dist-tag mutation, Solana write, keypair action,
credential/admin action, deploy, production restart, public announcement, paid
spend, or client commitment.

## Registry Readback

Checked at: `2026-08-20T06:08:57Z`

Non-mutating command:

```sh
npm view @brainai/satp-client version dist-tags versions --json
```

Readback:

- `latest`: `2.0.6`
- `rc`: `2.0.2`
- `versions`: `0.1.0-rc.0`, `2.0.0`, `2.0.1`, `2.0.2`, `2.0.3`, `2.0.4`, `2.0.5`, `2.0.6`

## Semver Selection

The next source release candidate is `2.0.7`. npm package versions are
immutable, and `2.0.6` is already the stable `latest` version, so the
post-PR-#145 packed-consumer UUID advisory remediation requires a new patch
version for any future publish.

## Source Prep

- `packages/satp-client/package.json` is advanced to `2.0.7`.
- Workspace packages that depend on `@brainai/satp-client` are pinned to
  `2.0.7` for source review.
- Root and package lockfiles record the same `2.0.7` metadata.
- Release metadata records npm `latest` as `2.0.6`, the unchanged historical
  `rc` tag as `2.0.2`, and `2.0.7` as the unpublished next candidate.
- The candidate includes PR #145 (`1816229`), which bundles the audited
  `@solana/web3.js` dependency tree and verifies that packed consumers resolve
  a fixed UUID version without consumer-side overrides.

## Required Evidence

Run from the repository root before PR delivery:

```sh
npm pkg get version --prefix packages/satp-client
npm pack --json --pack-destination <temporary-directory> ./packages/satp-client
npm audit --omit=dev
npm run check:satp-client-health
npm run check:release-metadata
npm run smoke:satp-client-packed-consumer
npm run ci
```

The packed-consumer smoke loads every explicit public export, the public
`package.json`, and every JavaScript module reachable through the `./src/*`
wildcard from a clean consumer install.

These commands are local or registry read-only checks. They must not publish to
npm, move npm tags, write Solana state, deploy, restart production, read or
change keypairs, rotate credentials, spend funds, make public launch claims, or
create client commitments.

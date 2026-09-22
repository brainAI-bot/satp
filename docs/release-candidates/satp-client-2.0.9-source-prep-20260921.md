# @brainai/satp-client 2.0.9 Source Release Candidate

Status: source-side patch release candidate only. This note does not approve or
perform an npm publish, npm dist-tag mutation, Solana write, keypair action,
credential/admin action, deploy, production restart, public announcement, paid
spend, or client commitment.

## Release baseline

The repository release metadata records npm `latest` as `2.0.8` and the
historical `rc` tag as `2.0.2`. Version `2.0.9` is the unpublished next source
candidate needed to close the documented 2.0.8 source divergence; this task does
not publish it.

## Production IDL boundary

The candidate packages both interface classes without conflating them:

- `@brainai/satp-client/idls/v3/*` remains the source-generated interface set.
- `@brainai/satp-client/idls/v3/mainnet/*` contains the six full immutable
  mainnet Program Metadata readbacks pinned by `docs/v3-deployed-truth.json`.

Production-cluster consumers must select the `mainnet` subpath. The deployed
mainnet attestations IDL has five instructions and omits
`create_verified_attestation`; release-safety and packed-consumer checks enforce
that omission. The source-generated IDL still contains the instruction and must
not be presented as the production instruction surface.

## Source prep

- `packages/satp-client/package.json` and both lockfiles advance to `2.0.9`.
- Workspace packages that depend on `@brainai/satp-client` pin `2.0.9`.
- Release metadata records `2.0.9` as `nextReleaseCandidate` above stable
  `2.0.8`.
- Package materialization and health checks include exactly six source IDLs and
  six mainnet IDLs.

## Required evidence

Run from the repository root before delivery:

```sh
npm run test:v3-deployed-programs
node packages/satp-client/test-release-safety.js
npm run validate:idls
npm run check:release-metadata
npm run check:satp-client-health
```

These are local, registry-read-only, or public-chain-read-only checks. They must
not publish to npm, move npm tags, write Solana state, deploy, read or change
keypairs, rotate credentials, spend funds, or create production commitments.

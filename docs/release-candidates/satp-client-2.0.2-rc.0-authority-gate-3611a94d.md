# @brainai/satp-client 2.0.2-rc.0 Release Packet Authority Gate [#3611a94d]

Status: release packet and authority-gate evidence checklist only. This packet does not approve publishing, promote npm dist-tags, deploy Solana programs, write Solana state, change keypairs, sign transactions, deploy or restart production, mutate credentials/admin/DNS/GitHub org settings, spend funds, announce publicly, perform Masthead work, or make client commitments.

## Release Candidate

- Package: `@brainai/satp-client`
- Candidate version: `2.0.2-rc.0`
- Expected npm tag if separately approved later: `rc`
- Current stable baseline: `2.0.1`
- Source marker: `[#3611a94d]`

## Required Evidence Before Promotion Review

Collect these read-only proofs in the PR and HQ delivery before requesting any promotion decision:

- CI proof: passing GitHub checks for this PR, or local output from `npm run ci` when checks are unavailable.
- Package contents proof: `npm pack --dry-run --json ./packages/satp-client` or `npm run check:satp-client-health`.
- Secret-scan proof: packed-file secret-shape scan from `npm run check:satp-client-health`, plus any repository-level scanner used by the reviewer.
- Consumer install proof: `npm run smoke:consumer-install`.
- Release metadata proof: `npm run check:release-metadata`.
- Compatibility proof: notes below remain accurate after the final diff and checks.
- Guardrail readback: explicit confirmation that no forbidden publish, deploy, key, signing, admin, spend, launch, client, or Masthead action occurred.

## Local Validation Commands

Run from the repository root:

```sh
npm run check:release-metadata
npm run check:satp-client-health
npm run smoke:consumer-install
npm run ci
```

The commands are intended to be read-only with respect to external services. `npm pack` and the consumer-install smoke create temporary local artifacts only; they must not publish or mutate npm dist-tags.

## Package Contents Gate

The release packet is blocked unless package dry-run evidence shows the packed surface is limited to the intended SATP client package files, including:

- `package.json`
- `README.md`
- `src/index.js`
- `src/index.d.ts`
- `src/wallet-control-challenge.js`
- `src/x402-discovery.js`

The packed surface must not include local env files, package locks, tests, key material, generated credentials, or unrelated workspace files.

## Consumer Install Gate

The clean-consumer smoke must prove that a temporary package consumer can install the local tarball with `--ignore-scripts --no-audit --no-fund`, resolve `@brainai/satp-client` from `node_modules`, and access the expected public exports.

## Compatibility Notes

- Runtime: Node `>=20.18`.
- Module shape: CommonJS package entrypoints with dynamic import smoke coverage.
- Public package surface: root export plus `./wallet-control-challenge`, `./x402-discovery`, `./src/*`, and `./package.json`.
- Solana compatibility: this packet changes no program, IDL, keypair, cluster state, or deploy flow.
- Consumer compatibility: the package remains an `rc` candidate above stable `2.0.1`; stable consumers should not move unless a separate promotion decision is approved.

## Authority Gates

This PR may only establish the release packet and evidence checklist. The following remain separately owner-gated:

- npm publish or dist-tag mutation.
- Solana devnet or mainnet writes.
- Keypair creation, rotation, import, export, or signing.
- Production deploys or restarts.
- Credential, admin, DNS, or GitHub org mutations.
- Paid spend, public launch actions, client commitments, or Masthead work.
- Roadmap status flip in `ROADMAP.md`; brainKID will create that as a separate docs-only PR after the deliverable is merged.

## Reviewer Checklist

- PR title or body contains `[#3611a94d]`.
- PR does not edit `ROADMAP.md`.
- CI or local validation evidence is attached.
- Package contents proof is attached.
- Secret-scan proof is attached.
- Consumer install proof is attached.
- Compatibility notes were checked against the final diff.
- Guardrail readback confirms no forbidden action occurred.

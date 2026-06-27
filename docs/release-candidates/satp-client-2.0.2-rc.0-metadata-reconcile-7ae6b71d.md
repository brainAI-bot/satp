# @brainai/satp-client 2.0.2-rc.0 Metadata Reconcile [#7ae6b71d]

Status: release-candidate metadata packet only. Do not publish, promote, deploy, write Solana state, change keypairs, mutate credentials/admin/DNS/GitHub org settings, spend funds, perform public launch actions, or make client/business commitments without a separate HQ approval.

## Registry Readback

Checked at: `2026-06-27T13:52:20Z`

Non-mutating command:

```sh
npm view @brainai/satp-client name version dist-tags versions --json
```

Readback:

- `name`: `@brainai/satp-client`
- `latest`: `2.0.1`
- `rc`: `0.1.0-rc.0`
- `versions`: `0.1.0-rc.0`, `2.0.0`, `2.0.1`

Additional package names checked with `npm view`:

- `@brainai/satp`: registry returned `E404`; local workspace package remains private.
- `@brainai/satp-core`: registry returned `E404`; local workspace package remains private.
- `@brainai/satp-solana`: registry returned `E404`; local workspace package remains private.

## Reconciliation

The previous local release-candidate metadata still pointed at `@brainai/satp-client@0.1.0-rc.0`, which is older than stable npm `latest` `2.0.1`.

The reconciled source-controlled candidate is `@brainai/satp-client@2.0.2-rc.0` with `publishConfig.tag=rc`. This keeps promotion gated while ensuring the next RC line is newer than stable latest.

## Files Inspected

- `package.json`
- `package-lock.json`
- `packages/satp-client/package.json`
- `packages/satp-client/package-lock.json`
- `packages/satp/package.json`
- `packages/satp-core/package.json`
- `packages/satp-solana/package.json`

## Validation

Run before any promotion decision:

```sh
npm run check:release-metadata
npm run check:satp-client-health
npm run ci
```

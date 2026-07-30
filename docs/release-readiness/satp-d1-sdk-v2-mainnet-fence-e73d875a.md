# SATP D1 SDK V2 mainnet fence republish readiness

Status: readiness packet for HQ task `TASK-6b4525d0` / `[#e73d875a]`.
This packet records the source, package, and client evidence after the merged
V2 fence and D1 SDK wiring PRs. It does not publish npm packages, deploy Solana
programs, read or move keypairs, perform devnet or mainnet writes, or change
`ROADMAP.md`.

## Current source state

| Item | Evidence |
| --- | --- |
| Base branch | `origin/main` at `e2e6c57cd9260e99b7935a79161326891cef1454`. |
| PR #121 | `MERGED` on 2026-07-28T16:30:20Z, merge commit `46dde70a55779480d28b61b1797a6e90e259601b`, title `Fence legacy SATP V2 mainnet access`. |
| PR #127 | `MERGED` on 2026-07-30T21:06:04Z, merge commit `e2e6c57cd9260e99b7935a79161326891cef1454`, title `[#a8e875a7] Mark SATP D1 SDK wiring shipped`. |

## V2 mainnet fence

`packages/satp-client/src/constants.js` keeps legacy V2 mainnet program IDs
behind an explicit fence. Default V2 mainnet program access throws
`Legacy SATP V2 mainnet program IDs are fenced`; read-only legacy access
requires `allowLegacyV2Mainnet: true`.

The release-safety check confirms:

- `new SATPSDK({ network: 'mainnet' })` fails closed by default.
- `getProgramIds('mainnet')` fails closed by default.
- `MAINNET_PROGRAM_IDS.IDENTITY` direct access fails closed.
- Explicit read-only legacy access still returns the internal V2 map, with
  legacy V2 mainnet escrow remaining `null`.

## V3 mainnet client wiring

`packages/satp-client/src/v3-pda.js` exports `V3_MAINNET_PROGRAM_IDS` from the
V3 registry path and keeps it separate from the legacy V2
`MAINNET_PROGRAM_IDS` fence:

| Program | Mainnet program ID |
| --- | --- |
| Identity | `GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG` |
| Reviews | `r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4` |
| Reputation | `2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ` |
| Attestations | `6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD` |
| Validation | `6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV` |
| Escrow | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` |

`getV3ProgramIds('mainnet')` returns this configured V3 set, and
`SATPV3SDK('mainnet')` uses it for the client program IDs.

## Package evidence

Local source package metadata:

- `packages/satp-client/package.json` name: `@brainai/satp-client`
- source version: `2.0.5`
- entrypoint: `src/index.js`
- types: `src/index.d.ts`
- public package files: `src/`, `examples/`, `README.md`
- `publishConfig.access`: `public`

Read-only npm registry evidence from 2026-07-30:

- `npm view @brainai/satp-client version dist-tags --json` returned version
  `2.0.5`, `latest=2.0.5`, and `rc=2.0.2`.
- `npm view @brainai/satp-client@2.0.5 version time dist-tags --json`
  returned `2.0.5` publish time `2026-07-27T18:32:58.459Z` and package
  modified time `2026-07-27T18:32:58.629Z`.

No npm publish was performed for this packet.

## Verification

Commands run from a clean worktree based on `origin/main`:

```bash
npm ci
npm run check:satp-client-health
npm run check:exports
npm --prefix packages/satp-client run check:exports
npm run test:v3
node scripts/smoke-satp-client-packed-consumer.js
npm view @brainai/satp-client version dist-tags --json
npm view @brainai/satp-client@2.0.5 version time dist-tags --json
```

Results:

- `npm ci`: added 60 packages; audit reported 0 vulnerabilities.
- `npm run check:satp-client-health`: passed metadata, production audit,
  dry-run pack, require/import/export smoke, and secret-shaped packed-file
  scan. Dry-run pack identified `@brainai/satp-client@2.0.5`, 24 files,
  shasum `b950583aa7290a31fa24ef9e27e628c4411b6715`.
- `npm run check:exports`: passed SATP export surface check.
- `npm --prefix packages/satp-client run check:exports`: passed release safety
  defaults.
- `npm run test:v3`: 104 passed, 0 failed.
- `node scripts/smoke-satp-client-packed-consumer.js`: passed packed consumer
  smoke.

## Remaining gate

No source, config, or test change is required for the current
`V3_MAINNET_PROGRAM_IDS` and legacy V2 mainnet fence state on `origin/main`.
The registry already reports `@brainai/satp-client@2.0.5` as `latest`.

Any future client republish, dist-tag change, Solana write, keypair movement,
devnet or mainnet deploy, or production action remains blocked until a separate
explicit HQ/Owner approval task authorizes that exact action.

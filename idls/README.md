# SATP IDLs

V3 consumers must use `idls/v3/` for deployed canonical interfaces.

`idls/v3/escrow_v3.json` is pinned to the verified source commit whose SBF
artifact matches the current mainnet escrow ProgramData prefix byte-for-byte;
the loader allocation suffix is separately proven to be all zeroes. The current
escrow source and the deployed source are the same interface, so generation now
writes escrow directly to `idls/v3/escrow_v3.json`.

The Anchor 1.0 Program Metadata IDL at
`4zNAR5DGuWuUnEbwGb7FzEVUUCx2xKca2bmHCeVpjQCJ` exposes the current
14-instruction escrow set for
`HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C`, but it is not the canonical
published construction surface. Its `release` and `partial_release` account
schemas omit the writable `treasury` account required by the repository IDL, so
consumers must fail closed until Program Metadata is republished with matching
name/order/writable/signer account tuples.

The legacy Anchor 0.31 IDL account
`D2TVCWarEDQ3w3YFMpackzymm9MGQKeWd1p1pCeZmBcn` remains stale at 9 instructions
and is non-canonical. Consumers that still read that account must fail closed or
label the result stale instead of treating it as the escrow V3 interface. See
`docs/escrow-v3-deployed-truth.json`.

`identity_registry.json`, `agentfolio-current/`, `devnet-backup/`, and the
root `reviews.json` / `reputation.json` / `attestations.json` / `validation.json`
files are V2 historical snapshots. Their embedded program IDs are not the
canonical V3 set.

Do not retarget those historical files to V3 IDs.

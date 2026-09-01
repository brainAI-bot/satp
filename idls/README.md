# SATP IDLs

V3 consumers must use `idls/v3/` for deployed canonical interfaces.

`idls/v3/escrow_v3.json` is pinned to the verified source commit whose SBF
artifact matches the current mainnet escrow ProgramData prefix byte-for-byte;
the loader allocation suffix is separately proven to be all zeroes. The current
escrow source and the deployed source are the same interface, so generation now
writes escrow directly to `idls/v3/escrow_v3.json`.

Both mainnet publication surfaces remain non-canonical: the legacy Anchor IDL is
stale at 9 instructions, and the 14-instruction Program Metadata IDL omits the
required `treasury` account from `release` and `partial_release`. They are
readback evidence, not the canonical repository reference. See
`docs/escrow-v3-deployed-truth.json`.

`identity_registry.json`, `agentfolio-current/`, `devnet-backup/`, and the
root `reviews.json` / `reputation.json` / `attestations.json` / `validation.json`
files are V2 historical snapshots. Their embedded program IDs are not the
canonical V3 set.

Do not retarget those historical files to V3 IDs.

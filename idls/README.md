# SATP IDLs

V3 consumers must use `idls/v3/` for deployed canonical interfaces.

`idls/v3/escrow_v3.json` is pinned to the verified source commit whose SBF
artifact matches the current mainnet escrow ProgramData byte-for-byte. The
newer, not-deployed escrow source interface is generated separately at
`idls/source-head/escrow_v3.json`. Consumers must not substitute the source-head
IDL for the deployed canonical IDL.

The mainnet Anchor IDL account for escrow is a stale 9-instruction publication;
it is readback evidence, not the canonical repository reference. See
`docs/escrow-v3-deployed-truth.json`.

`identity_registry.json`, `agentfolio-current/`, `devnet-backup/`, and the
root `reviews.json` / `reputation.json` / `attestations.json` / `validation.json`
files are V2 historical snapshots. Their embedded program IDs are not the
canonical V3 set.

Do not retarget those historical files to V3 IDs.

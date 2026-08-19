# SATP IDLs

V3 consumers must use `idls/v3/`.

`identity_registry.json`, `agentfolio-current/`, `devnet-backup/`, and the
root `reviews.json` / `reputation.json` / `attestations.json` / `validation.json`
files are V2 historical snapshots. Their embedded program IDs are not the
canonical V3 set.

Do not retarget those historical files to V3 IDs.

# REDO DEEPAUDIT SATP S2 Shared Proof

Task: `REDO-DEEPAUDIT-SATP-S2-SHARED-PROOF-20260720-1237Z`

Source task cited as required: `DEEPAUDIT-SATP-S2-DEPLOYED-IDL-REGEN-20260720-1158Z`

This redo preserves the same read-only deployed-program analysis shape, but moves the proof into a shared Git artifact so HQ can audit it outside the host-local filesystem.

## Artifact Contents

- `comparison.json`: generated source-vs-deployed IDL comparison summary.
- `deployed-idls/*.json`: devnet Anchor IDLs fetched from deployed IDL accounts.
- `program-show-devnet.txt`: read-only `solana program show` output for each compared program.

## Read-Only Sources

Repository source IDLs compared:

- `idls/attestations.json`
- `idls/identity_registry.json`
- `idls/reputation.json`
- `idls/reviews.json`
- `idls/validation.json`

Deployed Anchor IDLs were fetched from devnet with:

```sh
anchor idl fetch --provider.cluster devnet <PROGRAM_ID>
```

Program metadata was read with:

```sh
solana program show <PROGRAM_ID> --url devnet
```

No transaction, signature submission, keypair read/change, deploy, restart, npm publish, admin action, paid action, public launch, or client/business action was performed.

## Program IDs

| Program | Program ID | Source IDL | Fetched deployed IDL |
| --- | --- | --- | --- |
| attestations | `9xT3eNcndkmnqZtJqDQ1ggckHK7Dxo5EsAt5mHqsPBhP` | `idls/attestations.json` | `docs/audits/deepaudit-satp-s2-shared-proof-20260720/deployed-idls/attestations.json` |
| identity_registry | `EJtQh4Gyg88zXvSmFpxYkkeZsPwTsjfm4LvjmPQX1FD3` | `idls/identity_registry.json` | `docs/audits/deepaudit-satp-s2-shared-proof-20260720/deployed-idls/identity_registry.json` |
| reputation | `4y4W2Mdfpu91C4iVowiDyJTmdKSjo8bmSDQrX2c84WQF` | `idls/reputation.json` | `docs/audits/deepaudit-satp-s2-shared-proof-20260720/deployed-idls/reputation.json` |
| reviews | `D8HsSpK3JtAN7tVcA1yfgxScju7KcG6skEfaShSKojki` | `idls/reviews.json` | `docs/audits/deepaudit-satp-s2-shared-proof-20260720/deployed-idls/reviews.json` |
| validation | `8jLaqodAzfM7oCxP7aedFeszeNjnJ5ik56dzhDU2HQgc` | `idls/validation.json` | `docs/audits/deepaudit-satp-s2-shared-proof-20260720/deployed-idls/validation.json` |

## Observed Deployed-vs-Source Differences

- `attestations`: deployed IDL has one instruction not present in the source IDL: `create_review_attestation`.
- `reviews`: fetched deployed IDL was read through program ID `D8HsSpK3JtAN7tVcA1yfgxScju7KcG6skEfaShSKojki`, but the fetched IDL's internal `address` field is `Ge1sD2qwmH8QaaKCPZzZERvsFXNVMvKbAgTp2p17yjLK`; the source IDL has `D8HsSpK3JtAN7tVcA1yfgxScju7KcG6skEfaShSKojki`.
- `identity_registry`, `reputation`, and `validation`: no instruction/account/type name differences were observed in the generated comparison; source and fetched deployed IDL addresses match.

Hash details, counts, and per-program diff arrays are in `comparison.json`.

## Verification Commands Run

```sh
anchor idl fetch --provider.cluster devnet 9xT3eNcndkmnqZtJqDQ1ggckHK7Dxo5EsAt5mHqsPBhP
anchor idl fetch --provider.cluster devnet EJtQh4Gyg88zXvSmFpxYkkeZsPwTsjfm4LvjmPQX1FD3
anchor idl fetch --provider.cluster devnet 4y4W2Mdfpu91C4iVowiDyJTmdKSjo8bmSDQrX2c84WQF
anchor idl fetch --provider.cluster devnet D8HsSpK3JtAN7tVcA1yfgxScju7KcG6skEfaShSKojki
anchor idl fetch --provider.cluster devnet 8jLaqodAzfM7oCxP7aedFeszeNjnJ5ik56dzhDU2HQgc
solana program show 9xT3eNcndkmnqZtJqDQ1ggckHK7Dxo5EsAt5mHqsPBhP --url devnet
solana program show EJtQh4Gyg88zXvSmFpxYkkeZsPwTsjfm4LvjmPQX1FD3 --url devnet
solana program show 4y4W2Mdfpu91C4iVowiDyJTmdKSjo8bmSDQrX2c84WQF --url devnet
solana program show D8HsSpK3JtAN7tVcA1yfgxScju7KcG6skEfaShSKojki --url devnet
solana program show 8jLaqodAzfM7oCxP7aedFeszeNjnJ5ik56dzhDU2HQgc --url devnet
python3 scripts/validate-idls.py
```

## Safety Readback

Actions performed for this proof were read-only except for creating this repository artifact. No Solana write, keypair use/change, npm publish, deploy/restart, mainnet action, credential/admin action, paid action, public-launch action, or client/business action was performed.

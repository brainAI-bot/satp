# SATP signer public-ID readback

`npm run read:signer-public-id` is a value-free boundary between a configured
signer source and public authority verification. Its successful JSON output has
exactly three fields:

```json
{"publicIdentifier":"<SOLANA_PUBLIC_KEY>","sourceClass":"<SOURCE_CLASS>","verdict":"match|mismatch"}
```

The command never emits the keypair path, key bytes, environment values, or an
underlying parser/runtime error. Invalid input exits nonzero without stdout or
stderr. Operators must treat that exit status as a failed readback rather than
adding diagnostics that serialize protected inputs.

## Inputs

Inputs are supplied through these allowlisted environment keys so no keypair
path is placed in command arguments:

- `SATP_SIGNER_SOURCE_CLASS`: one of `already_public_identifier`,
  `synthetic_fixture`, or `protected_configured_keypair`.
- `SATP_EXPECTED_AUTHORITY`: the already-public Solana authority to compare.
- `SATP_SIGNER_PUBLIC_ID`: required only for `already_public_identifier`.
- `SATP_SIGNER_KEYPAIR_PATH`: required only for the two keypair-backed source
  classes. The command reads the file but never emits its path or contents.

`synthetic_fixture` is the only keypair-backed class used by automated tests.
`protected_configured_keypair` exists for a separately authorized protected
operations run. This repository task does not authorize using that class against
production or mainnet material.

Example using already-public identifiers only:

```sh
SATP_SIGNER_SOURCE_CLASS=already_public_identifier \
SATP_SIGNER_PUBLIC_ID='<PUBLIC_IDENTIFIER>' \
SATP_EXPECTED_AUTHORITY='<PUBLIC_AUTHORITY>' \
npm run --silent read:signer-public-id
```

## Contract trace

- **Writer:** the protected signer configuration owner, or a synthetic fixture
  creator in tests.
- **Canonical store:** the configured signer source selected outside this
  helper. The helper does not reveal its location.
- **Reader:** `scripts/read-satp-signer-public-id.mjs`.
- **User seam:** the three-field JSON record and process exit status consumed by
  protected operations.

A `match` or `mismatch` is repository/readback evidence only. It proves no
signing, transaction, authority mutation, deployment, npm publication, or money
movement. Any live keypair read and any live-chain action require separate task
authority.

# SATP Escrow Replacement CI Build Proof

Marker: [#49e40f78]

Branch: `brainchain/agentfolio-escrow-replacement-49e40f78`
Proof source under test: branch head containing this document update
Proof recorded: `2026-07-08 21:10 UTC`

This proof is for the replacement devnet escrow source slice added under
`programs/satp_escrow` and the committed IDL at `idls/satp_escrow.json`.

## Environment

- Node.js: `v25.9.0`
- npm: `11.12.1`
- Anchor CLI: `0.31.1`
- Rust toolchain: `1.86.0`
- Solana CLI: `2.1.21`
- SBF platform Rust/Cargo: `1.79.0-dev`
- HQ task: `TASK-321c3519`

## Commands

The following commands were run from the repository root:

```sh
npm ci
npm run ci
npm run check:satp-client-health
npm run test:conformance:rc-s6
npm run pack:satp-client
shasum -a 256 dist/brainai-satp-client-2.0.2-rc.0.tgz
cargo build-sbf --manifest-path programs/satp_escrow/Cargo.toml
shasum -a 256 target/deploy/satp_escrow.so
```

## Results

- `npm ci`: passed; 60 packages installed, 0 vulnerabilities.
- `npm run ci`: passed.
- `npm run check:satp-client-health`: passed.
- `npm run test:conformance:rc-s6`: passed; 12 offline conformance fixtures.
- `npm run pack:satp-client`: passed.
- `cargo build-sbf --manifest-path programs/satp_escrow/Cargo.toml`: passed.
- `target/deploy/satp_escrow.so`: produced locally, not deployed.

Dependency lock hardening:

- `solana-program` is constrained to `=2.1.21`, matching the installed Solana
  CLI/SBF toolchain.
- `Cargo.lock` pins the transitive crates that otherwise floated beyond SBF
  Cargo 1.79 compatibility:
  `blake3 1.5.4`, `indexmap 2.11.4`, `proc-macro-crate 3.4.0`,
  `toml_edit 0.23.10+spec-1.0.0`, `toml_datetime 0.7.5+spec-1.1.0`,
  `toml_parser 1.0.9+spec-1.1.0`, `unicode-segmentation 1.12.0`,
  and `zeroize 1.8.2`.

SBF artifact:

```text
target/deploy/satp_escrow.so
size: 234608 bytes
sha256: d8069cd186d58bd80b90de2de23731f4693180539c2877b62d98454aa187965b
```

Escrow source and IDL verification from `npm run ci`:

```json
{
  "ok": true,
  "idl": "idls/satp_escrow.json",
  "idl_sha256": "a1c8209e023137fd0147457f1fa10cc57a7b707e91da63565a7ff20d82951c1b",
  "idl_stable_sha256": "c9e542b2d14bb378dc85ea93ed4e5fa22def233ba0f49b5385da7a22f796b539",
  "source_tree_sha256": "2b32f67563ff084ef2e3980746d96f2d2cfa4bc521a1041a0f4abb805eacc56d",
  "program_id": "UpJ7jmUzHkQ7EdBKiBv3zq8Dr1fVh6GVWKa7nYtwQ22",
  "instructions": 6,
  "events": 5,
  "errors": 10
}
```

Packed artifact:

```text
dist/brainai-satp-client-2.0.2-rc.0.tgz
size: 52640 bytes
sha256: 1a0520deb0cf7a94a6e8d1e7b26e863da6bfcbc476a1135e5ae5183640e93d05
npm shasum: bdab6b1ee4dd9b5f2106bee8f0fced302e27507a
npm integrity: sha512-Mq7H+OaXWb62zKOuUjp0W5cfW6nJ5se6E36Z7s6NwGemeH6xXnlh3jMP8j2JaBkkwpVdl2RZGiWCNmnGijf+sA==
```

This proof did not deploy, publish, rotate keys, write to devnet/mainnet, or
touch AgentFolio product code.

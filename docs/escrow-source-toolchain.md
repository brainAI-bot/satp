# SATP Escrow Source Toolchain

Marker: [#49e40f78]

This repository now carries source for the replacement devnet escrow program.
The committed IDL is `idls/satp_escrow.json`; the source lives under
`programs/satp_escrow`.

Toolchain lock notes:

- Anchor CLI/version target: `0.31.1` as recorded in `Anchor.toml`.
- Rust channel target: `1.86.0` as recorded in `rust-toolchain.toml`.
- Solana/SBF toolchain target: Solana CLI `2.1.21`; the SBF platform
  tools currently invoke Rust/Cargo `1.79.0-dev` for the BPF build.
- Rust edition: `2021` as recorded in `programs/satp_escrow/Cargo.toml`.
- Program ID: `UpJ7jmUzHkQ7EdBKiBv3zq8Dr1fVh6GVWKa7nYtwQ22`, matching the
  committed IDL address.
- Verification is source-only and offline by default:
  `node scripts/verify-escrow-source-idl.mjs`.
- `Cargo.lock` is committed for the escrow workspace so SBF builds do not float
  to crates whose manifests require edition 2024 or Rust newer than Solana
  platform-tools can parse.

This source slice does not deploy, write to devnet/mainnet, create or move
keypairs, publish npm packages, restart production, perform admin actions, spend
funds, announce publicly, or change AgentFolio product code.

Disputed escrows remain frozen in this replacement source. Closing is limited to
Released or Cancelled states so the client cannot close a disputed escrow and
recover funds while the dispute is unresolved.

After a separately approved devnet deploy, brainForge can compare the PR-built
program artifact hash against:

    solana program dump <new_devnet_program_id> satp_escrow-devnet.so
    shasum -a 256 satp_escrow-devnet.so

It can also fetch the deployed IDL, sort it with the same stable JSON routine
used by `scripts/verify-escrow-source-idl.mjs`, and compare that sha256 against
the committed `idls/satp_escrow.json` sha256 from this PR.

The current local build proof was produced without deploying:

```sh
cargo build-sbf --manifest-path programs/satp_escrow/Cargo.toml
shasum -a 256 target/deploy/satp_escrow.so
```

Resulting local artifact:

```text
target/deploy/satp_escrow.so
size: 234608 bytes
sha256: d8069cd186d58bd80b90de2de23731f4693180539c2877b62d98454aa187965b
```

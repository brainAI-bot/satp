# SATP Escrow Source Toolchain

Marker: [#49e40f78]

This repository now carries source for the replacement devnet escrow program.
The committed IDL is `idls/satp_escrow.json`; the source lives under
`programs/satp_escrow`.

Toolchain lock notes:

- Anchor CLI/version target for `programs/satp_escrow`: `0.31.1`.
  The repository-level `Anchor.toml` may default to a newer V3 program
  toolchain; the escrow build-proof workflow pins the checked-out `Anchor.toml`
  to `0.31.1` inside the GitHub runner before running the legacy escrow build.
  The workflow also narrows the runner workspace to `programs/satp_escrow` and
  restores the base-branch `Cargo.lock` for this proof, because the PR carries
  V3 Anchor 1.0 sources whose newer dependency graph can require Cargo features
  unavailable to Solana SBF Cargo 1.79.
- Rust channel target: `1.86.0` as recorded in `rust-toolchain.toml`.
- Rust edition: `2021` as recorded in `programs/satp_escrow/Cargo.toml`.
- Program ID: `UpJ7jmUzHkQ7EdBKiBv3zq8Dr1fVh6GVWKa7nYtwQ22`, matching the
  committed IDL address.
- Verification is source-only and offline by default:
  `node scripts/verify-escrow-source-idl.mjs`.

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

The escrow build proof uses the base-branch lockfile in the GitHub runner for
the legacy `programs/satp_escrow` slice. That keeps the source proof
deterministic without changing the repository-wide V3 source dependency graph.

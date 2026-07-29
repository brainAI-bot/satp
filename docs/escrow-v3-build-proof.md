# Escrow V3 Build Proof

Marker: [#49e40f78]

`programs/escrow_v3` builds with Solana CLI 2.1.21 when `cargo build-sbf`
is pointed at SBF platform-tools `v1.52`. Earlier platform-tools bundled
Cargo 1.79/1.84 and failed before compilation on edition-2024 transitive
crates pulled by the Solana 3.x dependency graph.

Successful local proof command:

```sh
cargo build-sbf --tools-version v1.52 --manifest-path programs/escrow_v3/Cargo.toml
node scripts/verify-escrow-v3-build-proof.mjs
```

Artifact hash from the successful local build:

```text
fe866c0f57586aa2aa88089fcc4ce7359050218a2519a7f8556718efcf27db31  target/deploy/escrow_v3.so
```

The build-proof workflow now validates the produced `target/deploy/escrow_v3.so`
against `docs/escrow-v3-build-proof-reference.json`. That reference pins the
source build command, Solana CLI `2.1.21`, SBF platform-tools `v1.52`, the
expected rebuilt source artifact hash, and the real read-only devnet dump hash
recorded in `docs/escrow-v3-devnet-mismatch-plan-49e40f78.md`.

Current source-to-chain status: mismatch. The rebuilt source artifact hash is
`fe866c0f57586aa2aa88089fcc4ce7359050218a2519a7f8556718efcf27db31`; the
read-only devnet dump hash is
`9426908b0c3084f316fc963a9824bd6aad55c2487da22ffe213bbfa3b772f82b`.
`node scripts/verify-escrow-v3-build-proof.mjs` therefore fails until HQ
authorizes either a devnet write repair or recovery of the exact deployed
source. This is intentional: the build proof is no longer a hash-printing no-op.

Lockfile compatibility pins keep proc-macro TOML parser crates on
Cargo-1.85-compatible versions while still satisfying their declared semver
ranges:

- `indexmap 2.13.0`
- `toml_datetime 1.0.0+spec-1.1.0`
- `toml_edit 0.25.0+spec-1.1.0`
- `toml_parser 1.0.7+spec-1.1.0`

This proof does not deploy, write to devnet/mainnet, create or move authority
keypairs, publish npm packages, restart production, perform admin actions,
spend funds, announce publicly, or change AgentFolio product code.

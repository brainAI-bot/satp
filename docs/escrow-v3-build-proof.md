# Escrow V3 Build Proof

Marker: [#49e40f78]

`programs/escrow_v3` builds with Solana CLI 2.1.21 when `cargo build-sbf`
is pointed at SBF platform-tools `v1.52`. Earlier platform-tools bundled
Cargo 1.79/1.84 and failed before compilation on edition-2024 transitive
crates pulled by the Solana 3.x dependency graph.

The Solana 2.1.21 SBF SDK installer still declares platform-tools `v1.43` in
`sdk/sbf/scripts/install.sh`. The GitHub workflow rewrites that SDK installer
line from the declared `SBF_TOOLS_VERSION` before building, prints the
before/after resolved platform-tools version, and fails if the resolved value is
not exactly `v1.52`.

This proof job intentionally disables restored Rust target caching and runs
`cargo clean` immediately before `cargo build-sbf`; otherwise CI can reuse a
stale `target/deploy/escrow_v3.so` that was not produced from the checked-out
source. The job prints the fresh artifact hash immediately after the build and
the verifier then compares that same artifact against live programdata.

The devnet escrow artifact was deployed from a macOS SBF build. The proof job
therefore runs on a macOS GitHub runner; the same pinned Solana/SBF/Rust inputs
on Ubuntu produce a different ELF hash, which is useful mismatch evidence but
does not prove the currently deployed devnet artifact came from the checked-out
source.

Successful local proof command:

```sh
cargo build-sbf --tools-version v1.52 --manifest-path programs/escrow_v3/Cargo.toml
node scripts/verify-escrow-v3-build-proof.mjs
```

Artifact hash from the successful local build:

```text
fe866c0f57586aa2aa88089fcc4ce7359050218a2519a7f8556718efcf27db31  target/deploy/escrow_v3.so
```

The build-proof workflow now validates the freshly produced
`target/deploy/escrow_v3.so` against live upgradeable-loader programdata on
both devnet and mainnet-beta. The verifier fetches the Program account, follows
its ProgramData account, strips the 45-byte loader metadata prefix, trims
trailing account padding to the ELF-header/table length, hashes the live ELF
bytes, and compares that hash with the fresh source build hash.

Current source-to-chain status:

| Cluster | Program | Source build sha256 | Live programdata sha256 | Verdict |
| --- | --- | --- | --- | --- |
| devnet | `B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg` | `fe866c0f57586aa2aa88089fcc4ce7359050218a2519a7f8556718efcf27db31` | `fe866c0f57586aa2aa88089fcc4ce7359050218a2519a7f8556718efcf27db31` | MATCH |
| mainnet-beta | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` | `fe866c0f57586aa2aa88089fcc4ce7359050218a2519a7f8556718efcf27db31` | `9344275ab35c22e1734a44184300d3eb3bffc0368c7b285c7454e508781527d2` | DIFFER |

The devnet MATCH is the positive control: committed source currently rebuilds
byte-exact to the deployed devnet program. The mainnet DIFFER is intentional and
valuable evidence: the live mainnet program is not byte-exact to the committed
`programs/escrow_v3` source at this proof point.

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

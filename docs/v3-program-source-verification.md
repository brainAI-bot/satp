# SATP V3 Program Source Verification

This repository carries the extracted SATP V3 Anchor program sources from
`brainAI-bot/clawd-brainchain/satp-v3` at source commit
`94a1d309dcc692228c357f6e28ab679196235ad2`.

## Program Sources

| Program | Source path | Devnet `declare_id!` | Mainnet registry ID |
| --- | --- | --- | --- |
| identity_v3 | `programs/identity_v3` | `7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ` | `GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG` |
| reviews_v3 | `programs/reviews_v3` | `3yVFrWCpBnQdWNqmiCG9EpoZq7WYeQ421Gx5sUh41Kwk` | `r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4` |
| attestations_v3 | `programs/attestations_v3` | `55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw` | `6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD` |
| reputation_v3 | `programs/reputation_v3` | `CtmZ1fHaypt3R6wbeiGawiRnjzRK9T8jsECk9mET9AK9` | `2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ` |
| validation_v3 | `programs/validation_v3` | `DLB76DzAFY8KNuvnP79BZW3cehGreEQTeGDvFCNd2Ekj` | `6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV` |
| escrow_v3 | `programs/escrow_v3` | `B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg` | `B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg` |

The checked-in `Anchor.toml` uses devnet as the default read/build cluster and
keeps a repo-local placeholder wallet path. Do not replace that placeholder
with a private key path in git.

## Local Read-Only Validation

Run:

```sh
npm run verify:v3-program-sources
cargo +1.89.0 check --workspace
cargo build-sbf --tools-version v1.52 --manifest-path programs/escrow_v3/Cargo.toml
```

`npm run verify:v3-program-sources` performs offline readback of all six program
directories, checks each `declare_id!` against the devnet registry in
`Anchor.toml`, checks the mainnet registry entries in `Anchor.toml`, parses
nested IDL JSON files, and rejects committed `.env`, memory, target,
`.program-state`, keypair, secret, or env-style secret material in the V3
program tree. The Rust workspace check requires Rust 1.89.0 or newer because
the resolved Solana crate set rejects older compilers.

Current post-merge source tree SHA-256:

```text
da3540f726a72228f5082c15807a6a3cbf8d0393cf7febddf4a8c5824af05037
```

The `escrow_v3` SBF proof requires platform-tools `v1.52`; the Solana CLI
2.1.21 default platform-tools are too old for the Solana 3.x dependency graph
and fail before compilation on edition-2024 transitive crates.

## Anchor Verify

Full `anchor verify <PROGRAM_ID>` proof requires the Anchor and Solana CLIs plus
network access to the deployed program. This validation is read-only; it must
not deploy, upgrade, sign, move keypairs, publish npm packages, or write to
devnet/mainnet.

```sh
anchor build
anchor verify 7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ --provider.cluster devnet
anchor verify 3yVFrWCpBnQdWNqmiCG9EpoZq7WYeQ421Gx5sUh41Kwk --provider.cluster devnet
anchor verify 55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw --provider.cluster devnet
anchor verify CtmZ1fHaypt3R6wbeiGawiRnjzRK9T8jsECk9mET9AK9 --provider.cluster devnet
anchor verify DLB76DzAFY8KNuvnP79BZW3cehGreEQTeGDvFCNd2Ekj --provider.cluster devnet
anchor verify B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg --provider.cluster devnet
```

In the cron environment used for this extraction, `anchor` and `solana` were not
installed, so the full deployed-bytecode comparison could not be executed there.

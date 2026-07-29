# SATP V3 Program Source Verification

This repository carries the extracted SATP V3 Anchor program sources from
`brainAI-bot/clawd-brainchain/satp-v3` at source commit
`94a1d309dcc692228c357f6e28ab679196235ad2`.

## Program Sources

| Program | Source path | Source `declare_id!` | Devnet registry ID | Mainnet registry ID | Status |
| --- | --- | --- | --- | --- | --- |
| identity_v3 | `programs/identity_v3` | `7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ` | `7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ` | `GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG` | devnet source identity |
| reviews_v3 | `programs/reviews_v3` | `3yVFrWCpBnQdWNqmiCG9EpoZq7WYeQ421Gx5sUh41Kwk` | `3yVFrWCpBnQdWNqmiCG9EpoZq7WYeQ421Gx5sUh41Kwk` | `r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4` | devnet source identity |
| attestations_v3 | `programs/attestations_v3` | `55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw` | `55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw` | `6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD` | devnet source identity |
| reputation_v3 | `programs/reputation_v3` | `CtmZ1fHaypt3R6wbeiGawiRnjzRK9T8jsECk9mET9AK9` | `CtmZ1fHaypt3R6wbeiGawiRnjzRK9T8jsECk9mET9AK9` | `2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ` | devnet source identity |
| validation_v3 | `programs/validation_v3` | `DLB76DzAFY8KNuvnP79BZW3cehGreEQTeGDvFCNd2Ekj` | `DLB76DzAFY8KNuvnP79BZW3cehGreEQTeGDvFCNd2Ekj` | `6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV` | devnet source identity |
| escrow_v3 | `programs/escrow_v3` | default/devnet: `B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg`; `mainnet` feature: `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` | `B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg` | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` | explicit devnet/mainnet source split; mainnet remains canonical owner-selected identity |

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
directories, checks each `declare_id!` against the source identity table above
including the escrow V3 `mainnet` feature split, checks devnet and mainnet
registry entries in `Anchor.toml`, parses nested IDL JSON files, and rejects
committed `.env`, memory, target,
`.program-state`, keypair, secret, or env-style secret material in the V3
program tree. The Rust workspace check requires Rust 1.89.0 or newer because
the resolved Solana crate set rejects older compilers.

Current post-merge source tree SHA-256 after the 2026-07-28 owner decision to
keep `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` as the canonical escrow V3
mainnet program ID while preserving the required devnet build target:

```text
82100f8df592983bfd349a838dac24159938476f77696b399e518f31da270fd9
```

The `escrow_v3` SBF proof requires platform-tools `v1.52`; the Solana CLI
2.1.21 default platform-tools are too old for the Solana 3.x dependency graph
and fail before compilation on edition-2024 transitive crates.

The 2026-07-28 rebuild from corrected committed source produced
`target/deploy/escrow_v3.so` SHA-256
`173ab0ddfdb4a68cf6bfae389f2f430eb97333501d49d6cad588525de2bfc55b`.
The deployed mainnet ELF dumped from
`HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` produced SHA-256
`b70a7a7ea55f43da7bd3fc4f666e1374436bb9c8aeaa83cb2f0a2a970b603094`.
These hashes differ, so the source tree preserves the owner-selected mainnet
program ID but the rebuilt default/devnet source is not byte-identical to the
deployed mainnet program.

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
anchor verify HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C --provider.cluster mainnet-beta
```

On 2026-07-28, `anchor 0.31.1`, `solana-cli 2.1.21`, and
`cargo 1.86.0` were available in the brainChain runner; the SBF build and
mainnet program dump completed, and the comparison result was `DIFFER`.

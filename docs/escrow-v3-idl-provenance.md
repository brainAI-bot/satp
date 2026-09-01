# Escrow V3 IDL Provenance and Callable Boundary

Readback date: 2026-08-30 UTC.

## Current authoritative boundary

The current machine-verifiable packet is
`docs/escrow-v3-deployed-truth.json`. SATP commit
`3f8188bec89db0d4a081931f35272e10185d1c0d`, built with platform-tools
`v1.52` and the `mainnet` feature, produces a 350304-byte artifact with SHA-256
`27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a`.
A finalized readback proves that artifact is the exact prefix of the 357096-byte
mainnet ProgramData allocation and that the remaining 6792 bytes are zero
loader padding.

Accordingly, `idls/v3/escrow_v3.json` is the canonical repository IDL generated
from that verified deployed source. It has 14 instructions and SHA-256
`9bb7e2a441af653108b21360a8aa14daa9bd8d54eebbc5eef88e7f3de881ba10`.
The legacy Anchor IDL remains stale at 9 instructions. The canonical Program
Metadata IDL also remains stale: it has 14 instructions but omits `treasury`
from both SOL release routes. Consumers remain fail-closed until publication is
reconciled and independently verified.

The remainder of this document is historical readback and must not override the
current packet above.

This note distinguishes three artifacts that must not be treated as
interchangeable:

1. the generated source IDL committed at `idls/v3/escrow_v3.json`;
2. the program ELF currently deployed to each cluster; and
3. an Anchor IDL account published for a deployed program, when one exists.

No deploy, upgrade, IDL publish, authority action, transaction submission, or
other chain write was performed for this readback.

## Checked-In Source IDL

The committed IDL is generated from the local
`programs/escrow_v3/src/lib.rs` at the checked-out SATP revision. The
`brainAI-bot/clawd-brainchain/satp-v3@94a1d309dcc692228c357f6e28ab679196235ad2`
value emitted by `scripts/generate-v3-idls.mjs` records the original source
extraction lineage. It is not the provenance of either currently deployed ELF.

The escrow IDL was first generated in SATP commit `7817c81`, then its ABI was
expanded with token escrow support in commit
`72b90dc6a708064b82c2fbf6f9d4c9ba35ad5f49`. At SATP revision `3a81ae6`, the
source-generation check reports:

| Item | Value |
| --- | --- |
| Path | `idls/v3/escrow_v3.json` |
| File SHA-256 | `3d7e7a14788449f65c1a187a96543f7677bf08937e61638734ed3886dcf60a5a` |
| Key-order-stable SHA-256 | `3382cd7e7e89130a132418004da23bb2edca65793f994262112168dabbc2d576` |
| `address` field | empty string |
| Instructions | 14 |
| Source check | `node scripts/generate-v3-idls.mjs --check` passes |

Because its `address` is empty and its schema is generated from current local
source, this file is a source IDL. It is not evidence that the same IDL was
published on either cluster or that either deployed ELF was built from that
source.

## Deployed Readback

The deployed metadata and ELF dump hashes were read with `solana program show`
and `solana program dump`. The dump SHA-256 covers the full byte sequence
written by `solana program dump`, including its trailing allocation bytes.

| Cluster | Program | ProgramData | Last deployed slot | Dump bytes | Dump SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| devnet | `B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg` | `7m4t1wqt26s5haqS1n2HsRNoewMvLnTbzPkfFGkpZDD5` | 477004993 | 357096 | `261a85b81683e9464fa31b44509929b63f6437a05fad8b211abb184b37c0dc45` |
| mainnet-beta | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` | `Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk` | 410959957 | 290680 | `b70a7a7ea55f43da7bd3fc4f666e1374436bb9c8aeaa83cb2f0a2a970b603094` |

Both ProgramData accounts reported upgrade authority
`Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. These values identify the
deployed artifacts; they do not establish a source-build match. The separate
build proof documents the known source/deployed byte divergence.

## Published Anchor IDLs

The legacy Anchor IDL account address was derived for each program and read
without writing to the cluster.

| Cluster | Anchor IDL account | Readback |
| --- | --- | --- |
| devnet | `FivN5ANqf55Js5THDVzYU7tjq8mYkjdSE6xawpTAa3Ni` | absent at RPC slot 482942757 |
| mainnet-beta | `D2TVCWarEDQ3w3YFMpackzymm9MGQKeWd1p1pCeZmBcn` | present at RPC slot 438628509; 6808 account bytes |

The inflated JSON payload from the mainnet-beta IDL account is 12172 bytes with
SHA-256
`864e8af057c1b196156222ecda5853936bf4c6e0f3ae9f5c1e2ca2e53ed6c768`.
It names the mainnet program address and contains the nine SOL instructions
listed below. It does not contain the five token instructions added to the
current source IDL.

## Callable Instruction Subsets

Each checked-in eight-byte instruction discriminator was submitted to
`simulateTransaction` with no instruction accounts. This is a read-only
dispatcher probe:

- Anchor error 102 (`InstructionDidNotDeserialize`) or 3005
  (`AccountNotEnoughKeys`) means the dispatcher recognized the discriminator
  and continued into argument or account decoding.
- Anchor error 101 (`InstructionFallbackNotFound`) means the deployed
  dispatcher did not recognize the discriminator.

The probe ran at devnet RPC slot 482942473 and mainnet-beta RPC slot 438628264.

| Instruction | Source IDL | Devnet dispatcher | Mainnet dispatcher | Mainnet published IDL |
| --- | --- | --- | --- | --- |
| `create_escrow` | yes | recognized | recognized | yes |
| `submit_work` | yes | recognized | recognized | yes |
| `release` | yes | recognized | recognized | yes |
| `partial_release` | yes | recognized | recognized | yes |
| `cancel` | yes | recognized | recognized | yes |
| `raise_dispute` | yes | recognized | recognized | yes |
| `resolve_dispute` | yes | recognized | recognized | yes |
| `extend_deadline` | yes | recognized | recognized | yes |
| `close_escrow` | yes | recognized | recognized | yes |
| `create_usdc_escrow` | yes | recognized | error 101 | no |
| `release_usdc` | yes | recognized | error 101 | no |
| `partial_release_usdc` | yes | recognized | error 101 | no |
| `cancel_usdc` | yes | recognized | error 101 | no |
| `resolve_dispute_usdc` | yes | recognized | error 101 | no |

Therefore:

- the devnet callable discriminator set is all 14 instructions in the current
  source IDL, but no published Anchor IDL or source-to-ELF byte proof exists;
- the mainnet callable and published subset is the nine SOL instructions; and
- the five token instructions in the source IDL must not be sent to the current
  mainnet program.

Dispatcher recognition proves only that an entry point exists. It does not by
itself prove that every account layout, argument constraint, state layout, or
runtime behavior matches the checked-in source IDL. Consumers must preserve the
cluster boundary above and keep unsupported or unproven write paths gated.

## Reproduction

The source boundary is checked offline:

```sh
node scripts/generate-v3-idls.mjs --check
python3 scripts/validate-idls.py
shasum -a 256 idls/v3/escrow_v3.json
```

The deployed identity and full dump hash are read without submitting a
transaction:

```sh
solana program show -u devnet B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg
solana program show -u mainnet-beta HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C

tmp_dir="$(mktemp -d)"
solana program dump -u devnet B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg "$tmp_dir/devnet.so"
solana program dump -u mainnet-beta HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C "$tmp_dir/mainnet.so"
shasum -a 256 "$tmp_dir/devnet.so" "$tmp_dir/mainnet.so"
```

Slots and deployed hashes are point-in-time evidence. Repeat the readback after
any program upgrade or IDL-account change before relying on this boundary.

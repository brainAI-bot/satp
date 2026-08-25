# Escrow V3 SOL fee-routing change control [#011685d4]

Status: **NO-GO until exact-head independent review, green checks, and one
explicit Owner approval in HQ.** Preparation of this packet performed no chain
write, signing, keypair access, money movement, npm publication, production
mutation, or roadmap change.

## Locked candidate

| Field | Value |
| --- | --- |
| Program | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` |
| ProgramData | `Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk` |
| Certified source base | `93fc6c0d86302cfe8b0d8c798ba2817d7eeace44` |
| Candidate source commit | `2930ca34bb36cc419f64b45cf2367896a93c19c5` |
| Source SHA-256 | `d94957985c9fcd61cfcadbaadceaf81eb74fffddba26838726862a932e4bdd3c` |
| Cargo.lock SHA-256 | `d98db19e0d86ca3248376d4857b150b240be05c4bc3a409d7cb638ce4d5d2237` |
| Build command | `cargo build-sbf --tools-version v1.52 --manifest-path programs/escrow_v3/Cargo.toml --features mainnet` |
| Candidate SBF | `345744` bytes / `31234c83c007d39616ca7002e38a087e9e5ef69c3a074d97211e501ffddae704` |
| Allocated payload | `346856` bytes; candidate fits with `1112` zero-padding bytes |
| Padded payload SHA-256 | `5471b9fc45ed03bd9ddd468224c7002a77e664a1481d4c9bf9358283bc11a62b` |
| Generated IDL | `9bb7e2a441af653108b21360a8aa14daa9bd8d54eebbc5eef88e7f3de881ba10` |
| IDL compressed bytes | `3254` (within the recorded `6764`-byte payload capacity) |
| Treasury | `FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be` |
| Fee | `500` bps, floor-rounded on gross SOL release amount |

The delta adds the writable fixed treasury to SOL `release` and
`partial_release`. It preserves the 14 instruction names and discriminators,
the serialized `EscrowV3` layout, existing error numbers, and all five USDC
routes. USDC settlement is explicitly unchanged and does not certify or charge
a platform fee in this packet. Gross accounting is:

```text
platform_fee = floor(gross * 500 / 10000)
agent_amount = gross - platform_fee
agent_amount + platform_fee = gross
```

Zero release remains rejected, dust below 20 lamports routes zero fee without
loss, multiplication overflow fails closed, and a wrong treasury fails before
state or balance mutation. The shared identity verifier replaces duplicate SOL
logic with the already-used USDC verifier; its checks and error mapping are
unchanged and this keeps the candidate within the existing allocation.

## Approval gates

Stop before any write unless all of these are true at the same exact PR head:

1. GitHub checks are green and an independent brainShield protocol/security
   review explicitly approves the source, generated IDL, SDK account order,
   build artifact, rollback plan, and two bounded validations.
2. Owner approval in HQ quotes the exact source commit, SBF and IDL hashes,
   program and ProgramData addresses, upgrade-authority public key, treasury,
   total validation cap, time window, and rollback hash.
3. A finalized read-only preflight reconfirms the ProgramData address, current
   upgrade authority `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`,
   `346856`-byte allocation, and published IDL authority/capacity.
4. The current runtime is dumped and verified as the rollback payload:
   `346856` bytes / `4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d`.
5. AgentFolio SOL escrow writes are disabled and remain disabled through
   independent verification of both validation receipts.

No agent may locate, print, copy, generate, rotate, or take custody of the
Owner signer. A mismatch, dirty tree, stale approval, non-green check, artifact
larger than `346856`, or unavailable rollback payload is an unconditional stop.

## Owner-only write window

These are templates, not authorization. The Owner supplies signer references
privately and first verifies their public identities. Use `--no-auto-extend`;
this candidate requires no ProgramData extension.

```sh
solana program write-buffer target/deploy/escrow_v3.so \
  --url "$MAINNET_RPC" --fee-payer "$FEE_PAYER" \
  --buffer "$UPGRADE_BUFFER_SIGNER" --buffer-authority "$OWNER_SIGNER" \
  --max-len 346856 --output json
solana program deploy \
  --url "$MAINNET_RPC" --fee-payer "$FEE_PAYER" \
  --program-id HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C \
  --buffer "$UPGRADE_BUFFER_SIGNER" --upgrade-authority "$OWNER_SIGNER" \
  --no-auto-extend --max-len 346856 --output json
anchor idl upgrade --provider.cluster mainnet \
  --provider.wallet "$OWNER_SIGNER" --filepath idls/v3/escrow_v3.json \
  HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C
```

Never retry an uncertain write. Read finalized state first. Preserve the
program transaction, IDL transaction, slot, block time, balance debits, and
finalized program/IDL readbacks in HQ.

## Exactly two bounded validation transactions

Owner approval must name two newly created dedicated SOL canary escrows and a
single aggregate gross cap. No existing user escrow is eligible.

1. Transaction A calls `release` once for canary A's full gross amount.
2. Transaction B calls `partial_release` once for canary B's full gross amount,
   leaving no residual canary value.

Each gross amount must be at least 20 lamports so the fee is non-zero. Before
each transaction capture finalized escrow, agent, and treasury balances. After
finalization prove, excluding transaction fees and account-rent effects:

```text
treasury_delta = floor(gross * 500 / 10000)
agent_delta = gross - treasury_delta
escrow_delta = -gross
```

Record both signatures, slots, block times, exact ordered accounts, program
logs, and pre/post balances. Stop after two submissions regardless of outcome.
Do not retry a failed or uncertain validation without a new Owner decision.
USDC paths receive read-only compatibility checks only.

## Rollback and containment

Rollback triggers include any runtime/IDL hash mismatch, authority drift,
wrong recipient or delta, canary failure, interface drift, unexplained program
error, or inability to produce finalized evidence. Immediately keep writes
disabled, stop validation, preserve evidence, and read finalized state.

If the upgrade finalized and a trigger remains, use the pre-verified rollback
buffer/payload and republish the pre-change IDL under the rollback authority
already included in the Owner approval. The expected restored payload is
`346856` bytes / `4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d`;
the restored IDL is `e8c142f27e225d8edc2f8f41e6fb698ebbb73f69d2fc078d5bf963234ebc8fa9`.
Rollback is itself a mainnet write: never improvise it or rotate authority.

Writes may be re-enabled only after independent review proves the candidate
source reproduces the approved candidate SBF, the finalized runtime dump has
the approved SBF hash, the published 14-instruction IDL matches, both bounded
receipts conserve gross value, and the upgrade authority is unchanged.

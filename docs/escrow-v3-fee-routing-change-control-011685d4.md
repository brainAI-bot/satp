# Escrow V3 SOL fee-routing change control [#011685d4]

Status: **NO-GO until two-host candidate reproducibility, exact-head independent
review, green checks, and one explicit Owner approval in HQ.** Preparation of
this amended packet performed no chain write, signing, keypair access, money
movement, npm publication, production mutation, or roadmap change. Its
machine-readable bounds are locked in
`docs/escrow-v3-fee-routing-extension-011685d4.json`.

## Reworked candidate (independent review pending; not deployed)

This record is intentionally separate from
`docs/escrow-v3-mainnet-locked-build.json`. The locked-build file continues to
describe the bytes deployed at slot 441423817; the values below describe only
the reworked candidate at source commit
`a35568bc3926bd44d73680813bda0e8d5371705f`. Exact-head independent review
and green checks remain mandatory before any approval.

| Field | Value |
| --- | --- |
| Program | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` |
| ProgramData | `Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk` |
| Certified source base | `93fc6c0d86302cfe8b0d8c798ba2817d7eeace44` |
| Candidate source commit | `a35568bc3926bd44d73680813bda0e8d5371705f` |
| Source SHA-256 | `380b20d36f18253a5c382ec1abc4a1147a08092a9a42cdae25e5d954f41acd0a` |
| Cargo.lock SHA-256 | `d98db19e0d86ca3248376d4857b150b240be05c4bc3a409d7cb638ce4d5d2237` |
| Build command | `cargo build-sbf --tools-version v1.52 --manifest-path programs/escrow_v3/Cargo.toml --features mainnet` |
| Candidate SBF | `350304` bytes / `27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a` |
| Allocated payload | `346856` bytes; candidate exceeds allocation by `3448` bytes |
| Padded payload SHA-256 | N/A; ProgramData extension is required before buffer writes |
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
state or balance mutation. A dedicated `PlatformFeeRouted` event records the
gross amount, agent amount, platform fee, and fixed treasury for every SOL fee
split. The original inline `create_escrow` identity and authorization block is
untouched by the rework.

## Candidate reproducibility gate

The candidate bytes are not approvable until two distinct clean hosts reproduce
the exact same result from the immutable Git object, not from a working tree.
Each host must archive commit `a35568bc3926bd44d73680813bda0e8d5371705f`,
verify source SHA-256 `380b20d36f18253a5c382ec1abc4a1147a08092a9a42cdae25e5d954f41acd0a`
and Cargo.lock SHA-256
`d98db19e0d86ca3248376d4857b150b240be05c4bc3a409d7cb638ce4d5d2237`,
then run the recorded build command with Solana CLI/cargo-build-sbf `2.1.21`
and platform tools `v1.52`.

Each attestation must contain a non-secret host identity, clean-checkout commit,
source and Cargo.lock hashes, complete tool versions, exact command, artifact
byte count and hash, generated IDL hash, and build-log hash. Both must report:

```text
artifact_bytes=350304
artifact_sha256=27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a
idl_sha256=9bb7e2a441af653108b21360a8aa14daa9bd8d54eebbc5eef88e7f3de881ba10
```

The recorded author build is only attestation one. A green build that reproduces
the older deployed `4f21da13…` payload does not satisfy attestation two for this
candidate. The independent reviewer must bind both attestation identifiers and
log hashes into the exact-head verdict before Owner approval.

The same clean-host job runs the handler-level fee arithmetic/treasury tests and
`fee_routing_litesvm`. The LiteSVM suite loads the pinned candidate SBF, executes
both `release` and `partial_release`, asserts recipient and escrow lamport deltas,
decodes the `PlatformFeeRouted` discriminator from program logs, and proves that
wrong-treasury and excessive-partial failures roll back state and every writable
recipient balance.

## Exact ProgramData extension bound

The finalized preflight must show the current `346856`-byte payload allocation.
The candidate is `350304` bytes, so the only permitted extension is exactly
`3448` additional bytes, producing a `350304`-byte payload allocation and a
`350349`-byte ProgramData account including its 45-byte header. Extra headroom
is forbidden: it would change the approved rent debit and post-state.

A read-only mainnet-beta query at finalized slot `441750334` reconfirmed the
ProgramData address and authority above, last deploy slot `441423817`, payload
allocation `346856`, and current balance `2415321840` lamports. At that snapshot,
the rent-exempt minimum for the exact `350349`-byte target account was
`2439319920` lamports, implying a `23998080`-lamport top-up. This observation is
evidence only and must be repeated at finalized commitment immediately before
Owner approval; it authorizes no transaction.

The Owner approval must quote the finalized preflight slot, current ProgramData
lamports, target rent-exempt lamports for 350349 account bytes, exact rent top-up,
and a transaction-fee cap. The extension has a one-submission budget and zero
automatic retries. It must finalize before either deployment buffer is written.
After finalization, the first 346856 payload bytes must still hash to
`4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d`
and the appended 3448-byte suffix must be all zero. Any other allocation, prefix
hash, suffix content, authority, rent debit, or uncertain result stops the
window and requires a new Owner decision.

## Approval gates

Stop before any write unless all of these are true at the same exact PR head:

1. Two distinct clean-host attestations reproduce the exact candidate SBF and
   IDL hashes above; their immutable identifiers and log hashes are in HQ.
2. GitHub checks are green and an independent brainShield protocol/security
   review explicitly approves the source, generated IDL, SDK account order,
   build artifact, exact 3448-byte extension, rollback plan, and two bounded
   validations.
3. Owner approval in HQ quotes the exact source commit, SBF and IDL hashes,
   program and ProgramData addresses, upgrade-authority public key, treasury,
   350304-byte target allocation, rent top-up and fee caps, total validation
   cap, time window, and rollback hash.
4. A finalized read-only preflight reconfirms the ProgramData address, current
   upgrade authority `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`,
   `346856`-byte allocation, and published IDL authority/capacity.
5. The current runtime is dumped and verified as the rollback payload:
   `346856` bytes / `4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d`.
6. AgentFolio SOL escrow writes are disabled and remain disabled through
   independent verification of both validation receipts.

No agent may locate, print, copy, generate, rotate, or take custody of the
Owner signer. A mismatch, dirty tree, stale approval, non-green check, artifact
other than exactly `350304` bytes, or unavailable rollback payload is an
unconditional stop.

## Owner-only write window

These are templates, not authorization. The Owner supplies signer references
privately and first verifies their public identities. The extension is a
separate, single approved transaction. Do not write either buffer until its
finalized post-state passes every assertion below.

```sh
PROGRAM_ID='HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C'
PROGRAMDATA_ID='Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk'
TARGET_PROGRAMDATA_PAYLOAD_BYTES='350304'
TARGET_PROGRAMDATA_ACCOUNT_BYTES='350349'
solana program show "$PROGRAM_ID" --url "$MAINNET_RPC" --output json \
  > pre-extension-program.json
test "$(jq -r '.programdataAddress' pre-extension-program.json)" = "$PROGRAMDATA_ID"
test "$(jq -r '.authority' pre-extension-program.json)" = 'Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc'
PROGRAMDATA_PAYLOAD_BYTES="$(jq -r '.dataLen' pre-extension-program.json)"
test "$PROGRAMDATA_PAYLOAD_BYTES" = '346856'
ADDITIONAL_PROGRAM_BYTES="$((TARGET_PROGRAMDATA_PAYLOAD_BYTES - PROGRAMDATA_PAYLOAD_BYTES))"
test "$ADDITIONAL_PROGRAM_BYTES" = '3448'
TARGET_PROGRAMDATA_RENT_LAMPORTS="$(solana rent "$TARGET_PROGRAMDATA_ACCOUNT_BYTES" --lamports --url "$MAINNET_RPC" | awk '{print $3}')"
CURRENT_PROGRAMDATA_LAMPORTS="$(jq -r '.lamports' pre-extension-program.json)"
PROGRAMDATA_RENT_TOP_UP_LAMPORTS="$((TARGET_PROGRAMDATA_RENT_LAMPORTS - CURRENT_PROGRAMDATA_LAMPORTS))"
test "$PROGRAMDATA_RENT_TOP_UP_LAMPORTS" -ge 0
test "$PROGRAMDATA_RENT_TOP_UP_LAMPORTS" -le "$OWNER_APPROVED_RENT_TOP_UP_LAMPORTS"
printf 'additional_program_bytes=%s target_account_bytes=%s target_rent_lamports=%s rent_top_up_lamports=%s\n' \
  "$ADDITIONAL_PROGRAM_BYTES" "$TARGET_PROGRAMDATA_ACCOUNT_BYTES" \
  "$TARGET_PROGRAMDATA_RENT_LAMPORTS" "$PROGRAMDATA_RENT_TOP_UP_LAMPORTS"
solana program extend "$PROGRAM_ID" "$ADDITIONAL_PROGRAM_BYTES" \
  --url "$MAINNET_RPC" --keypair "$OWNER_SIGNER" --output json \
  > extension-transaction.json

# Wait for finalized confirmation once; never resubmit an uncertain extension.
solana program show "$PROGRAM_ID" --url "$MAINNET_RPC" --commitment finalized \
  --output json > post-extension-program.json
test "$(jq -r '.programdataAddress' post-extension-program.json)" = "$PROGRAMDATA_ID"
test "$(jq -r '.authority' post-extension-program.json)" = 'Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc'
test "$(jq -r '.dataLen' post-extension-program.json)" = "$TARGET_PROGRAMDATA_PAYLOAD_BYTES"
curl --fail --silent --show-error "$MAINNET_RPC" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk",{"encoding":"base64","commitment":"finalized"}]}' \
  | jq -r '.result.value.data[0]' | base64 --decode | tail -c +46 \
  > post-extension-payload.bin
test "$(stat -f '%z' post-extension-payload.bin)" = "$TARGET_PROGRAMDATA_PAYLOAD_BYTES"
head -c 346856 post-extension-payload.bin > post-extension-prefix.bin
tail -c +346857 post-extension-payload.bin > post-extension-suffix.bin
test "$(shasum -a 256 post-extension-prefix.bin | awk '{print $1}')" = '4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d'
test "$(stat -f '%z' post-extension-suffix.bin)" = '3448'
LC_ALL=C tr -d '\000' < post-extension-suffix.bin > post-extension-nonzero-suffix.bin
test ! -s post-extension-nonzero-suffix.bin

solana program write-buffer target/deploy/escrow_v3.so \
  --url "$MAINNET_RPC" --fee-payer "$FEE_PAYER" \
  --buffer "$UPGRADE_BUFFER_SIGNER" --buffer-authority "$OWNER_SIGNER" \
  --max-len "$TARGET_PROGRAMDATA_PAYLOAD_BYTES" --output json
solana program deploy \
  --url "$MAINNET_RPC" --fee-payer "$FEE_PAYER" \
  --program-id "$PROGRAM_ID" \
  --buffer "$UPGRADE_BUFFER_SIGNER" --upgrade-authority "$OWNER_SIGNER" \
  --no-auto-extend --max-len "$TARGET_PROGRAMDATA_PAYLOAD_BYTES" --output json
anchor idl upgrade --provider.cluster mainnet \
  --provider.wallet "$OWNER_SIGNER" --filepath idls/v3/escrow_v3.json \
  "$PROGRAM_ID"
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

For both routes the exact ordered accounts are `escrow, client, agent,
treasury`. The instruction discriminator is `fdf90fce1c7fc1f1` for `release`
and `140465f53583d508` for `partial_release`. The required
`PlatformFeeRouted` event discriminator is `f81b63224f0de0cf`; its decoded
escrow, agent, treasury, gross, net-agent, and fee fields must equal the balance
proof for that same signature.

Record both signatures, slots, block times, finalized confirmation, exact
ordered accounts, transaction fee, raw transaction JSON and its SHA-256,
program logs, decoded fee event, and indexed pre/post balances. Each receipt
must independently prove its instruction discriminator and that the treasury
is the immutable address above. Stop after two submissions regardless of
outcome. Do not retry a failed or uncertain validation without a new Owner
decision. USDC paths receive read-only compatibility checks only.

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

ProgramData extension is not reversible by rollback. After restoring the old
346856-byte payload into the 350304-byte allocation, verify the old payload
hash over the first 346856 bytes and prove the trailing 3448 bytes are zero.
The rollback buffer must therefore be prepared and inspected before extension,
but sized for the approved 350304-byte allocation; do not invoke auto-extension
or attempt to shrink ProgramData during rollback.

Writes may be re-enabled only after independent review proves the candidate
source reproduces the approved candidate SBF, the finalized runtime dump has
the approved SBF hash, the published 14-instruction IDL matches, both bounded
receipts conserve gross value, and the upgrade authority is unchanged.

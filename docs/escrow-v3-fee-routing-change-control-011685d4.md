# Escrow V3 SOL fee-routing change control [#011685d4]

Status: **NO-GO until exact-head independent review, green checks, and one
explicit Owner approval in HQ.** Two-host candidate reproducibility is complete.
Preparation of
this amended packet performed no chain write, signing, keypair access, money
movement, npm publication, production mutation, or roadmap change. Its
machine-readable bounds are locked in
`docs/escrow-v3-fee-routing-extension-011685d4.json`.

## Reworked candidate (independent review pending; not deployed)

This record is intentionally separate from
`docs/escrow-v3-mainnet-locked-build.json`. The locked-build file continues to
describe the bytes deployed at slot 441423817; the values below describe only
the reworked candidate at canonical merged source commit
`3f8188bec89db0d4a081931f35272e10185d1c0d`. This squash-merge commit contains
the same source, Cargo.lock, and IDL hashes as the reviewed PR source commit
`a35568bc3926bd44d73680813bda0e8d5371705f`, while remaining reachable from a
clean clone of `main`. Exact-head independent review
and green checks remain mandatory before any approval.

| Field | Value |
| --- | --- |
| Program | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` |
| ProgramData | `Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk` |
| Certified source base | `93fc6c0d86302cfe8b0d8c798ba2817d7eeace44` |
| Candidate source commit | `3f8188bec89db0d4a081931f35272e10185d1c0d` |
| Source SHA-256 | `380b20d36f18253a5c382ec1abc4a1147a08092a9a42cdae25e5d954f41acd0a` |
| Cargo.lock SHA-256 | `d98db19e0d86ca3248376d4857b150b240be05c4bc3a409d7cb638ce4d5d2237` |
| Build command | `cargo build-sbf --tools-version v1.52 --manifest-path programs/escrow_v3/Cargo.toml --features mainnet` |
| Candidate SBF | `350304` bytes / `27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a` |
| Allocated payload | `346856` bytes; candidate overrun is `3448` bytes, but the loader extension minimum is `10240` bytes |
| Loader-valid target | `357096` payload bytes / `357141` ProgramData account bytes |
| Post-deploy assertions | first `350304` bytes match the candidate SBF hash; trailing `6792` bytes are zero |
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
Each host must archive commit `3f8188bec89db0d4a081931f35272e10185d1c0d`,
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

Both required hosts reproduced the candidate:

| Role | Non-secret host identity | SBF bytes / SHA-256 | Build-log SHA-256 |
| --- | --- | --- | --- |
| Author | `brainchain-mac-mini/darwin-arm64/macos-26.4` | `350304` / `27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a` | `4d68d7ac7e61b30ed1b4988fdba388ed92efdfbfa5650bfb8ac6d994a22279c5` |
| Independent | `github-actions/macos-26/run-32916499013/attempt-1` | `350304` / `27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a` | `d2b5fcf3f9bfa8bda4aebd79e9d9b2c46a85a5740cae7450e7c8544c1eab12dc` |

Both used host Rust/Cargo `1.86.0`, Solana CLI and cargo-build-sbf `2.1.21`,
platform tools `v1.52` / SBF rustc `1.89.0-dev`, the exact command above, and
produced IDL SHA-256
`9bb7e2a441af653108b21360a8aa14daa9bd8d54eebbc5eef88e7f3de881ba10`.
The independent artifact is retained as
`escrow-v3-fee-routing-candidate-32916499013-1` on workflow run
`32916499013`. The independent reviewer must bind both attestation identifiers
and log hashes into the exact-head verdict before Owner approval.

The same clean-host job runs the handler-level fee arithmetic/treasury tests and
`fee_routing_litesvm`. The LiteSVM suite loads the pinned candidate SBF, executes
both `release` and `partial_release`, asserts recipient and escrow lamport deltas,
decodes the `PlatformFeeRouted` discriminator from program logs, and proves that
wrong-treasury and excessive-partial failures roll back state and every writable
recipient balance.

## Exact ProgramData extension bound

The finalized preflight must show the current `346856`-byte payload allocation.
The candidate is `350304` bytes, an overrun of `3448` bytes. The Solana loader
extension instruction requires at least `10240` additional bytes while the
SIMD-0431 feature is active, so `3448` is not executable. This is enforced in
the pinned Agave loader source at
[`a4144392`, lines 873-895](https://github.com/anza-xyz/agave/blob/a4144392c8ffd8d0840e312ecc3a59d35533c005/programs/bpf_loader/src/lib.rs#L873-L895):
requests below `MINIMUM_EXTEND_PROGRAM_BYTES` return `InvalidArgument` unless
the account is within that amount of the maximum permitted account length. The
mainnet-beta feature account
[`YbbRL...K7a5`](https://explorer.solana.com/address/YbbRLkvenrocjGPGyoQE4wjnvYzTgfsk38NFmcYK7a5?cluster=mainnet-beta),
which the same pinned Agave tree maps to
[`loader_v3_minimum_extend_program_size`](https://github.com/anza-xyz/agave/blob/a4144392c8ffd8d0840e312ecc3a59d35533c005/feature-set/src/lib.rs#L1471-L1473),
is owned by the feature program and encoded `Some(432864000)` at finalized
observation slot `442785710`; this proves the gate is active. The candidate
ProgramData is not near the maximum account length, so the exception does not
apply. The only permitted extension is therefore exactly `10240` bytes,
producing a `357096`-byte payload allocation and a `357141`-byte ProgramData
account including its 45-byte header. Any other value is forbidden: it would
either fail the loader or change the approved rent debit and post-state.

A read-only mainnet-beta query at finalized slot `442774304` reconfirmed the
ProgramData address and authority above, last deploy slot `441423817`, payload
allocation `346856`, and current balance `2415321840` lamports. At that snapshot,
the rent-exempt minimum for the exact `357141`-byte target account was
`2486592240` lamports, implying an exact `71270400`-lamport top-up. The rent
top-up cap is therefore `71270400` lamports, the extension transaction-fee cap
is `10000` lamports, and the total extension debit cap is `71280400` lamports.
This observation is evidence only and must be repeated at finalized commitment
immediately before Owner approval; it authorizes no transaction.

The Owner approval must quote the finalized preflight slot, current ProgramData
lamports, target rent-exempt lamports for `357141` account bytes, exact rent
top-up, transaction-fee cap, and total debit cap. The extension has a
one-submission budget and zero automatic retries. It must finalize before either
deployment buffer is written. After finalization, the first 346856 payload bytes
must still hash to
`4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d`
and the appended 10240-byte suffix must be all zero; the complete extended
payload must hash to
`ee4d6ee5220d755c846fcab7d6acffbde68b3a176dc3bd66e4ee661c1defd1fb`.
That complete-payload hash is derived locally from the observed current payload
plus `10240` zero bytes; it is a deterministic post-state assertion, not a loader
execution or simulation result. Loader legality is established separately by
the source and active feature account above.
After deployment, the first `350304` bytes must match the candidate artifact
hash and the trailing `6792` bytes must be zero. No full padded candidate hash is
claimed by the offline verifier; these are finalized runtime readback checks.
Any other allocation, payload hash, prefix, suffix content, authority, rent
debit, fee debit, or uncertain result stops the window and requires a new Owner
decision.

## Approval gates

Stop before any write unless all of these are true at the same exact PR head:

1. Two distinct clean-host attestations reproduce the exact candidate SBF and
   IDL hashes above; their immutable identifiers and log hashes are in HQ.
2. GitHub checks are green and an independent brainShield protocol/security
   review explicitly approves the source, generated IDL, SDK account order,
   build artifact, exact 10240-byte loader-minimum extension, rollback plan, and two bounded
   validations.
3. Owner approval in HQ quotes the exact source commit, SBF and IDL hashes,
   program and ProgramData addresses, upgrade-authority public key, treasury,
   357096-byte target allocation, rent top-up, transaction-fee and total-debit caps, total validation
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
LOADER_MINIMUM_ADDITIONAL_BYTES='10240'
TARGET_PROGRAMDATA_PAYLOAD_BYTES='357096'
TARGET_PROGRAMDATA_ACCOUNT_BYTES='357141'
RENT_TOP_UP_CAP_LAMPORTS='71270400'
EXTENSION_TRANSACTION_FEE_CAP_LAMPORTS='10000'
TOTAL_EXTENSION_DEBIT_CAP_LAMPORTS="$((RENT_TOP_UP_CAP_LAMPORTS + EXTENSION_TRANSACTION_FEE_CAP_LAMPORTS))"
test "$TOTAL_EXTENSION_DEBIT_CAP_LAMPORTS" = '71280400'
solana program show "$PROGRAM_ID" --url "$MAINNET_RPC" --commitment finalized --output json \
  > pre-extension-program.json
test "$(jq -r '.programdataAddress' pre-extension-program.json)" = "$PROGRAMDATA_ID"
test "$(jq -r '.authority' pre-extension-program.json)" = 'Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc'
PROGRAMDATA_PAYLOAD_BYTES="$(jq -r '.dataLen' pre-extension-program.json)"
test "$PROGRAMDATA_PAYLOAD_BYTES" = '346856'
ADDITIONAL_PROGRAM_BYTES="$((TARGET_PROGRAMDATA_PAYLOAD_BYTES - PROGRAMDATA_PAYLOAD_BYTES))"
test "$ADDITIONAL_PROGRAM_BYTES" -ge "$LOADER_MINIMUM_ADDITIONAL_BYTES"
test "$ADDITIONAL_PROGRAM_BYTES" = '10240'
TARGET_PROGRAMDATA_RENT_LAMPORTS="$(solana rent "$TARGET_PROGRAMDATA_ACCOUNT_BYTES" --lamports --url "$MAINNET_RPC" | awk '{print $3}')"
CURRENT_PROGRAMDATA_LAMPORTS="$(jq -r '.lamports' pre-extension-program.json)"
PROGRAMDATA_RENT_TOP_UP_LAMPORTS="$((TARGET_PROGRAMDATA_RENT_LAMPORTS - CURRENT_PROGRAMDATA_LAMPORTS))"
test "$PROGRAMDATA_RENT_TOP_UP_LAMPORTS" -ge 0
test "$PROGRAMDATA_RENT_TOP_UP_LAMPORTS" = '71270400'
test "$PROGRAMDATA_RENT_TOP_UP_LAMPORTS" -le "$RENT_TOP_UP_CAP_LAMPORTS"
printf 'additional_program_bytes=%s target_account_bytes=%s target_rent_lamports=%s rent_top_up_lamports=%s fee_cap_lamports=%s total_debit_cap_lamports=%s\n' \
  "$ADDITIONAL_PROGRAM_BYTES" "$TARGET_PROGRAMDATA_ACCOUNT_BYTES" \
  "$TARGET_PROGRAMDATA_RENT_LAMPORTS" "$PROGRAMDATA_RENT_TOP_UP_LAMPORTS" \
  "$EXTENSION_TRANSACTION_FEE_CAP_LAMPORTS" "$TOTAL_EXTENSION_DEBIT_CAP_LAMPORTS"
solana program extend "$PROGRAM_ID" "$ADDITIONAL_PROGRAM_BYTES" \
  --url "$MAINNET_RPC" --keypair "$OWNER_SIGNER" --output json \
  > extension-transaction.json

# Wait for finalized confirmation once; never resubmit an uncertain extension.
EXTENSION_SIGNATURE="$(jq -r '.signature' extension-transaction.json)"
test -n "$EXTENSION_SIGNATURE"
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
test "$(stat -f '%z' post-extension-suffix.bin)" = '10240'
LC_ALL=C tr -d '\000' < post-extension-suffix.bin > post-extension-nonzero-suffix.bin
test ! -s post-extension-nonzero-suffix.bin
test "$(shasum -a 256 post-extension-payload.bin | awk '{print $1}')" = 'ee4d6ee5220d755c846fcab7d6acffbde68b3a176dc3bd66e4ee661c1defd1fb'
curl --fail --silent --show-error "$MAINNET_RPC" \
  -H 'content-type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getTransaction\",\"params\":[\"$EXTENSION_SIGNATURE\",{\"encoding\":\"json\",\"commitment\":\"finalized\",\"maxSupportedTransactionVersion\":0}]}" \
  > extension-transaction-finalized.json
test "$(jq -r '.result.meta.err' extension-transaction-finalized.json)" = 'null'
EXTENSION_TRANSACTION_FEE_LAMPORTS="$(jq -r '.result.meta.fee' extension-transaction-finalized.json)"
test "$EXTENSION_TRANSACTION_FEE_LAMPORTS" -le "$EXTENSION_TRANSACTION_FEE_CAP_LAMPORTS"
ACTUAL_EXTENSION_DEBIT_LAMPORTS="$((PROGRAMDATA_RENT_TOP_UP_LAMPORTS + EXTENSION_TRANSACTION_FEE_LAMPORTS))"
test "$ACTUAL_EXTENSION_DEBIT_LAMPORTS" -le "$TOTAL_EXTENSION_DEBIT_CAP_LAMPORTS"

solana program write-buffer target/deploy/escrow_v3.so \
  --url "$MAINNET_RPC" --fee-payer "$FEE_PAYER" \
  --buffer "$UPGRADE_BUFFER_SIGNER" --buffer-authority "$OWNER_SIGNER" \
  --max-len "$TARGET_PROGRAMDATA_PAYLOAD_BYTES" --output json
solana program deploy \
  --url "$MAINNET_RPC" --fee-payer "$FEE_PAYER" \
  --program-id "$PROGRAM_ID" \
  --buffer "$UPGRADE_BUFFER_SIGNER" --upgrade-authority "$OWNER_SIGNER" \
  --no-auto-extend --max-len "$TARGET_PROGRAMDATA_PAYLOAD_BYTES" --output json

# Verify the padded candidate runtime before the IDL write or either canary.
curl --fail --silent --show-error "$MAINNET_RPC" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk",{"encoding":"base64","commitment":"finalized"}]}' \
  | jq -r '.result.value.data[0]' | base64 --decode | tail -c +46 \
  > post-deploy-payload.bin
test "$(stat -f '%z' post-deploy-payload.bin)" = '357096'
head -c 350304 post-deploy-payload.bin > post-deploy-artifact.bin
tail -c +350305 post-deploy-payload.bin > post-deploy-suffix.bin
test "$(shasum -a 256 post-deploy-artifact.bin | awk '{print $1}')" = '27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a'
test "$(stat -f '%z' post-deploy-suffix.bin)" = '6792'
LC_ALL=C tr -d '\000' < post-deploy-suffix.bin > post-deploy-nonzero-suffix.bin
test ! -s post-deploy-nonzero-suffix.bin

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
346856-byte payload into the 357096-byte allocation, verify the old payload
hash over the first 346856 bytes and prove the trailing 10240 bytes are zero.
The rollback buffer must therefore be prepared and inspected before extension,
but sized for the approved 357096-byte allocation; do not invoke auto-extension
or attempt to shrink ProgramData during rollback.

Writes may be re-enabled only after independent review proves the candidate
source reproduces the approved candidate SBF, the finalized runtime dump has
the approved SBF hash, the published 14-instruction IDL matches, both bounded
receipts conserve gross value, and the upgrade authority is unchanged.

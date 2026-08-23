# Escrow V3 Mainnet Owner Signing Packet

Status: owner signature required; no command in the write sections has been run.

This packet is for the one Owner-gated replacement of the unattributable
2026-08-19 `escrow_v3` binary. It does not enable AgentFolio live escrow flags,
change an authority, publish an npm package, or authorize any other chain write.

## Immutable inputs

- Program: `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C`
- ProgramData: `Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk`
- IDL account: `D2TVCWarEDQ3w3YFMpackzymm9MGQKeWd1p1pCeZmBcn`
- Source commit: `0bf088e5618f173dff7e0fba622bc2911212c52e`
- Locked artifact: `target/deploy/escrow_v3.so`
- Locked artifact bytes: `346856`
- Locked artifact SHA-256: `4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d`
- Locked IDL: `idls/v3/escrow_v3.json` with the HXCU address and 14 instructions
- Current ProgramData allocated payload bytes: `346856` (`346901` account bytes including the 45-byte header)
- Current IDL account bytes: `6808` (`6764` bytes available after the 44-byte Anchor IDL header)
- Locked IDL zlib bytes: `3249` (well below the current `6764`-byte capacity)
- Current allocated payload SHA-256: `53e922d8792d3ec2d447c497f37dfe8e4ffd1d9bde0f9d6edc0bb3578e67c17f`
- Current dumped ELF SHA-256: `88058f4322bb8cbb9227b6f35ae3c78baf2be9c01a3bd70523f803f9bfa7f078`

The checked-in machine-readable recipe is
`docs/escrow-v3-mainnet-locked-build.json`. The PR CI artifact must report the
same locked artifact SHA-256 as the independent brainChain host build before
the Owner uses this packet.

## Owner-only variable contract

Set these locally in the Owner signing environment. Do not paste their values
into HQ, GitHub, logs, or chat.

```sh
export MAINNET_RPC='https://api.mainnet-beta.solana.com'
export OWNER_SIGNER='<owner upgrade-authority signer URI or local path>'
export FEE_PAYER='<owner-approved fee-payer signer URI or local path>'
export ROLLBACK_BUFFER_SIGNER='<new local rollback-buffer signer path>'
export UPGRADE_BUFFER_SIGNER='<new local upgrade-buffer signer path>'
```

The Owner must confirm that `solana address --keypair "$OWNER_SIGNER"` equals
the current upgrade authority before any write. The signer files and their
contents are deliberately outside this repository.

## Read-only preflight

Run from the reviewed PR checkout after CI succeeds:

```sh
scripts/build-escrow-v3-mainnet-locked.sh
test "$(shasum -a 256 target/deploy/escrow_v3.so | awk '{print $1}')" = '4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d'
test "$(stat -f '%z' target/deploy/escrow_v3.so)" = '346856'
node scripts/verify-escrow-v3-mainnet-locked.mjs --artifact
solana program show HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C --url "$MAINNET_RPC" --output json > preflight-escrow-v3-program.json
test "$(jq -r '.programdataAddress' preflight-escrow-v3-program.json)" = 'Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk'
PROGRAMDATA_PAYLOAD_BYTES="$(jq -r '.dataLen' preflight-escrow-v3-program.json)"
if test "$PROGRAMDATA_PAYLOAD_BYTES" = '346856'; then
  printf '%s\n' 'ProgramData capacity branch: exact'
elif test "$PROGRAMDATA_PAYLOAD_BYTES" -gt 346856; then
  printf '%s\n' 'ProgramData capacity branch: padded'
else
  printf '%s\n' 'ProgramData capacity branch: extension required; stop before buffer writes'
fi
curl --fail --silent --show-error "$MAINNET_RPC" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["D2TVCWarEDQ3w3YFMpackzymm9MGQKeWd1p1pCeZmBcn",{"encoding":"base64","commitment":"finalized"}]}' \
  > preflight-escrow-v3-idl-account.json
IDL_ACCOUNT_BYTES="$(jq -r '.result.value.space' preflight-escrow-v3-idl-account.json)"
test "$IDL_ACCOUNT_BYTES" = '6808'
test "$(shasum -a 256 idls/v3/escrow_v3.json | awk '{print $1}')" = 'e8c142f27e225d8edc2f8f41e6fb698ebbb73f69d2fc078d5bf963234ebc8fa9'
LOCKED_IDL_ZLIB_BYTES="$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {deflateSync} from 'node:zlib'; process.stdout.write(String(deflateSync(readFileSync('idls/v3/escrow_v3.json')).length))")"
test "$LOCKED_IDL_ZLIB_BYTES" = '3249'
test "$LOCKED_IDL_ZLIB_BYTES" -le "$((IDL_ACCOUNT_BYTES - 44))"
solana program dump HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C rollback-escrow-v3-53e922d8.so --url "$MAINNET_RPC"
test "$(shasum -a 256 rollback-escrow-v3-53e922d8.so | awk '{print $1}')" = '53e922d8792d3ec2d447c497f37dfe8e4ffd1d9bde0f9d6edc0bb3578e67c17f'
anchor idl fetch --provider.cluster mainnet HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C --out rollback-escrow-v3-9-instruction-idl.json
test "$(jq '.instructions | length' rollback-escrow-v3-9-instruction-idl.json)" = '9'
test "$(solana address --keypair "$OWNER_SIGNER")" = 'Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc'
test "$(anchor --version)" = 'anchor-cli 1.0.0'
node scripts/read-anchor-idl-authority.mjs \
  preflight-escrow-v3-idl-account.json \
  Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc
```

`solana program dump` writes the finalized ProgramData payload, so the rollback
file must match the current allocated payload SHA-256 rather than the separately
recorded dumped ELF SHA-256.

Anchor CLI 1.0.0 no longer exposes the legacy `anchor idl authority` command.
The checked-in readback helper decodes the same 32-byte authority field directly
from the finalized IDL account response already captured by this preflight.

Stop if any assertion differs. A `ProgramData capacity branch: extension
required` result is not permission to continue to the buffer writes; it selects
only the extension procedure below.

The `PROGRAMDATA_PAYLOAD_BYTES` branch is mandatory:

- Exactly `346856`: proceed. This is the read-only mainnet value recorded when
  this packet was prepared.
- Greater than `346856`: proceed, but retain the allocation. The post-state
  checks below hash only the first `346856` payload bytes and separately prove
  that every trailing byte is zero.
- Less than `346856`: do not write either deployment buffer. Run the Owner-signed
  extension step below first, record its transaction and rent debit in HQ, then
  repeat the entire read-only preflight.

For the less-than branch, the target ProgramData account length is `346901`
bytes including its 45-byte header. Its current mainnet rent-exempt minimum is
`2415321840` lamports. The exact top-up is that value minus the current
ProgramData lamports reported in `preflight-escrow-v3-program.json`; the CLI
prints and charges it in this Owner-signed transaction:

```sh
ADDITIONAL_PROGRAM_BYTES="$((346856 - PROGRAMDATA_PAYLOAD_BYTES))"
TARGET_PROGRAMDATA_RENT_LAMPORTS="$(solana rent 346901 --lamports --url "$MAINNET_RPC" | awk '{print $3}')"
CURRENT_PROGRAMDATA_LAMPORTS="$(jq -r '.lamports' preflight-escrow-v3-program.json)"
PROGRAMDATA_RENT_TOP_UP_LAMPORTS="$((TARGET_PROGRAMDATA_RENT_LAMPORTS - CURRENT_PROGRAMDATA_LAMPORTS))"
test "$ADDITIONAL_PROGRAM_BYTES" -gt 0
test "$PROGRAMDATA_RENT_TOP_UP_LAMPORTS" -ge 0
printf 'additional_program_bytes=%s target_rent_lamports=%s rent_top_up_lamports=%s\n' \
  "$ADDITIONAL_PROGRAM_BYTES" "$TARGET_PROGRAMDATA_RENT_LAMPORTS" "$PROGRAMDATA_RENT_TOP_UP_LAMPORTS"
solana program extend HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C \
  "$ADDITIONAL_PROGRAM_BYTES" \
  --url "$MAINNET_RPC" \
  --keypair "$OWNER_SIGNER" \
  --output json
```

`solana program extend` uses `OWNER_SIGNER` as both upgrade authority and payer;
fund that signer for the printed rent top-up plus transaction fee before this
optional step. The current equal-capacity branch has a zero extension cost and
must not run it.

## Owner-signed rollback buffer preparation

This write happens before the replacement. It retains the current ELF under a
dedicated buffer so the prior program can be restored with one upgrade command.

```sh
solana program write-buffer rollback-escrow-v3-53e922d8.so \
  --url "$MAINNET_RPC" \
  --fee-payer "$FEE_PAYER" \
  --buffer "$ROLLBACK_BUFFER_SIGNER" \
  --buffer-authority "$OWNER_SIGNER" \
  --max-len 346856 \
  --max-sign-attempts 20 \
  --output json
solana program show "$(solana address --keypair "$ROLLBACK_BUFFER_SIGNER")" \
  --url "$MAINNET_RPC" \
  --output json
```

Record the rollback buffer public key and write-buffer transaction in the HQ
approval record before continuing. Do not close the buffer after a successful
replacement; it is the rollback control.

## Owner-signed replacement and IDL upgrade

```sh
solana program write-buffer target/deploy/escrow_v3.so \
  --url "$MAINNET_RPC" \
  --fee-payer "$FEE_PAYER" \
  --buffer "$UPGRADE_BUFFER_SIGNER" \
  --buffer-authority "$OWNER_SIGNER" \
  --max-len 346856 \
  --max-sign-attempts 20 \
  --output json
solana program deploy \
  --url "$MAINNET_RPC" \
  --fee-payer "$FEE_PAYER" \
  --program-id HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C \
  --buffer "$UPGRADE_BUFFER_SIGNER" \
  --upgrade-authority "$OWNER_SIGNER" \
  --max-len 346856 \
  --max-sign-attempts 20 \
  --output json
anchor idl upgrade \
  --provider.cluster mainnet \
  --provider.wallet "$OWNER_SIGNER" \
  --filepath idls/v3/escrow_v3.json \
  HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C
```

The deploy and IDL transaction signatures must be copied to HQ. A successful
CLI exit is not closure; the read-only post-state checks below are mandatory.

## Read-only post-state verification

Expected program bytes after the replacement:

```text
bytes: 346856
sha256: 4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d
```

Run the canonical account and interface probes:

```sh
solana program dump HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C post-upgrade-escrow-v3.so --url "$MAINNET_RPC"
test "$(shasum -a 256 post-upgrade-escrow-v3.so | awk '{print $1}')" = '4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d'
curl --fail --silent --show-error "$MAINNET_RPC" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk",{"encoding":"base64","commitment":"finalized"}]}' \
  | jq -r '.result.value.data[0]' | base64 --decode | tail -c +46 > post-upgrade-allocated-payload.bin
test "$(stat -f '%z' post-upgrade-allocated-payload.bin)" = "$PROGRAMDATA_PAYLOAD_BYTES"
head -c 346856 post-upgrade-allocated-payload.bin > post-upgrade-artifact-region.bin
tail -c +346857 post-upgrade-allocated-payload.bin > post-upgrade-padding-region.bin
test "$(stat -f '%z' post-upgrade-artifact-region.bin)" = '346856'
test "$(shasum -a 256 post-upgrade-artifact-region.bin | awk '{print $1}')" = '4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d'
LC_ALL=C tr -d '\000' < post-upgrade-padding-region.bin > post-upgrade-nonzero-padding.bin
test ! -s post-upgrade-nonzero-padding.bin
anchor idl fetch --provider.cluster mainnet HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C --out post-upgrade-escrow-v3-idl.json
test "$(jq -r '.address' post-upgrade-escrow-v3-idl.json)" = 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C'
test "$(jq '.instructions | length' post-upgrade-escrow-v3-idl.json)" = '14'
curl --fail --silent --show-error https://agentfolio.bot/api/v3/escrow/health | jq '{escrowAuthority,escrowProvenance}'
test "$(curl --silent --show-error --output post-upgrade-create-gate.json --write-out '%{http_code}' \
  https://agentfolio.bot/api/v3/escrow/create \
  -H 'content-type: application/json' \
  --data '{"clientWallet":"FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be","agentWallet":"11111111111111111111111111111112","agentId":"post_deploy_gate_probe","amountLamports":1,"description":"post deploy gate probe","deadlineUnix":1793632765}')" = '423'
```

Expected AgentFolio read-only results after its normal refresh:

- `escrowAuthority.status` is no longer `blocked_pending_authoritative_source_idl`.
- `escrowProvenance.mismatchStatus` is cleared.
- Money-moving POST routes remain HTTP 423 because live escrow flags are not in
  this ruling.

## One-command rollback

If any post-state assertion fails, the Owner restores the retained current
buffer with this upgrade command and then republishes the prior 9-instruction
IDL from the separately retained pre-upgrade IDL file:

```sh
solana program deploy \
  --url "$MAINNET_RPC" \
  --fee-payer "$FEE_PAYER" \
  --program-id HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C \
  --buffer "$ROLLBACK_BUFFER_SIGNER" \
  --upgrade-authority "$OWNER_SIGNER" \
  --max-len 346856 \
  --max-sign-attempts 20 \
  --output json
anchor idl upgrade \
  --provider.cluster mainnet \
  --provider.wallet "$OWNER_SIGNER" \
  --filepath rollback-escrow-v3-9-instruction-idl.json \
  HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C
```

After rollback, the allocated payload readback must return to
`53e922d8792d3ec2d447c497f37dfe8e4ffd1d9bde0f9d6edc0bb3578e67c17f`.

#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/target/v3-deployed-proof/rebuilt"
programs=(
  attestations_v3
  escrow_v3
  identity_v3
  reputation_v3
  reviews_v3
  validation_v3
)

mkdir -p "$HOME/.cache/solana" "$out"

for program in "${programs[@]}"; do
  cargo build-sbf \
    --tools-version v1.52 \
    --manifest-path "$root/programs/$program/Cargo.toml" \
    --features mainnet \
    -- --locked
  cp "$root/target/deploy/$program.so" "$out/$program.so"
done

node "$root/scripts/verify-v3-deployed-programs.mjs"

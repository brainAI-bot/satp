#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$root/docs/escrow-v3-deployed-truth.json"
source_commit="$(node -e "const m=require(process.argv[1]); process.stdout.write(m.verified_source.commit)" "$manifest")"
expected_hash="$(node -e "const m=require(process.argv[1]); process.stdout.write(m.verified_source.artifact_sha256)" "$manifest")"
expected_bytes="$(node -e "const m=require(process.argv[1]); process.stdout.write(String(m.verified_source.artifact_bytes))" "$manifest")"
temp_parent="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
build_root="$(mktemp -d "$temp_parent/satp-escrow-v3-deployed-source-${source_commit}.XXXXXX")"
trap 'rm -rf "$build_root"' EXIT
source_root="$build_root/source"
artifact_out="${ESCROW_V3_DEPLOYED_ARTIFACT_OUT:-$root/target/deployed-truth/escrow_v3.so}"

mkdir -p "$source_root" "$(dirname "$artifact_out")"
git -C "$root" archive "$source_commit" | tar -x -C "$source_root"

(
  cd "$source_root"
  cargo build-sbf \
    --tools-version v1.52 \
    --manifest-path programs/escrow_v3/Cargo.toml \
    --features mainnet >&2
)

source_artifact="$source_root/target/deploy/escrow_v3.so"
actual_hash="$(shasum -a 256 "$source_artifact" | awk '{print $1}')"
actual_bytes="$(stat -f '%z' "$source_artifact" 2>/dev/null || stat -c '%s' "$source_artifact")"

test "$actual_hash" = "$expected_hash"
test "$actual_bytes" = "$expected_bytes"
cp "$source_artifact" "$artifact_out"

ESCROW_V3_DEPLOYED_SOURCE_ARTIFACT="$artifact_out" \
  node "$root/scripts/verify-escrow-v3-deployed-truth.mjs" --live

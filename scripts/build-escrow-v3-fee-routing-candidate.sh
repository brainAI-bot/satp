#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

manifest="docs/escrow-v3-fee-routing-candidate-011685d4.json"
source_commit="$(jq -r '.source.commit' "$manifest")"
expected_source_sha="$(jq -r '.source.sha256' "$manifest")"
expected_lock_sha="$(jq -r '.source.cargo_lock_sha256' "$manifest")"
expected_idl_sha="$(jq -r '.idl.sha256' "$manifest")"
expected_artifact_sha="$(jq -r '.build.artifact_sha256' "$manifest")"
expected_artifact_bytes="$(jq -r '.build.artifact_bytes' "$manifest")"

fail() {
  echo "escrow_v3 fee-routing candidate build failed: $*" >&2
  exit 1
}

test "$(uname -s)" = "Darwin" || fail "host OS must be Darwin"
test "$(uname -m)" = "arm64" || fail "host architecture must be arm64"
test "$(sw_vers -productVersion | cut -d. -f1)" = "26" || fail "macOS major version must be 26"
git cat-file -e "${source_commit}^{commit}" || fail "pinned source commit is unavailable"
test "$(git show "${source_commit}:programs/escrow_v3/src/lib.rs" | shasum -a 256 | awk '{print $1}')" = "$expected_source_sha" || fail "source hash mismatch"
test "$(git show "${source_commit}:Cargo.lock" | shasum -a 256 | awk '{print $1}')" = "$expected_lock_sha" || fail "Cargo.lock hash mismatch"
test "$(git show "${source_commit}:idls/v3/escrow_v3.json" | shasum -a 256 | awk '{print $1}')" = "$expected_idl_sha" || fail "IDL hash mismatch"
test "$(rustc --version | awk '{print $2}')" = "1.86.0" || fail "rustc must be 1.86.0"
test "$(cargo --version | awk '{print $2}')" = "1.86.0" || fail "cargo must be 1.86.0"

if ! command -v solana >/dev/null 2>&1; then
  pinned_solana_bin="$HOME/.local/share/solana/install/releases/2.1.21/solana-release/bin"
  test -x "$pinned_solana_bin/solana" || fail "Solana CLI 2.1.21 is not installed"
  export PATH="$pinned_solana_bin:$PATH"
fi
solana --version | grep -q 'solana-cli 2.1.21 ' || fail "Solana CLI must be 2.1.21"
cargo-build-sbf --version | grep -q 'solana-cargo-build-sbf 2.1.21' || fail "cargo-build-sbf must be 2.1.21"
mkdir -p "$HOME/.cache/solana"

temp_parent="${TMPDIR:-/tmp}"
temp_parent="${temp_parent%/}"
build_root="$(mktemp -d "$temp_parent/satp-escrow-v3-fee-candidate.XXXXXX")"
cleanup() {
  trap - EXIT
  case "$build_root" in
    "$temp_parent"/satp-escrow-v3-fee-candidate.*) rm -rf "$build_root" ;;
    *) echo "refusing to remove unexpected temporary path $build_root" >&2 ;;
  esac
}
trap cleanup EXIT

git archive "$source_commit" | tar -x -C "$build_root"
cd "$build_root"
cargo build-sbf --tools-version v1.52 --manifest-path programs/escrow_v3/Cargo.toml --features mainnet \
  2>&1 | tee "$repo_root/build-sbf-fee-routing-candidate.log"

artifact="$build_root/target/deploy/escrow_v3.so"
actual_artifact_sha="$(shasum -a 256 "$artifact" | awk '{print $1}')"
actual_artifact_bytes="$(stat -f '%z' "$artifact")"
test "$actual_artifact_sha" = "$expected_artifact_sha" || fail "artifact sha256=$actual_artifact_sha expected=$expected_artifact_sha"
test "$actual_artifact_bytes" = "$expected_artifact_bytes" || fail "artifact bytes=$actual_artifact_bytes expected=$expected_artifact_bytes"

mkdir -p "$repo_root/target/fee-routing-candidate"
cp "$artifact" "$repo_root/target/fee-routing-candidate/escrow_v3.so"
cd "$repo_root"
node scripts/verify-escrow-v3-fee-routing-extension.mjs

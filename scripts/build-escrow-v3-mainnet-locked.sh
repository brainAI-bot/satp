#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

manifest="docs/escrow-v3-mainnet-locked-build.json"
source_commit="$(jq -r '.source.commit' "$manifest")"
expected_source_sha="$(jq -r '.source.sha256' "$manifest")"
expected_lock_sha="$(jq -r '.source.cargo_lock_sha256' "$manifest")"
expected_artifact_sha="$(jq -r '.build.artifact_sha256' "$manifest")"
expected_artifact_bytes="$(jq -r '.build.artifact_bytes' "$manifest")"

fail() {
  echo "escrow_v3 locked mainnet build failed: $*" >&2
  exit 1
}

test "$(uname -s)" = "Darwin" || fail "host OS must be Darwin"
test "$(uname -m)" = "arm64" || fail "host architecture must be arm64"
test "$(sw_vers -productVersion | cut -d. -f1)" = "26" || fail "macOS major version must be 26"

git cat-file -e "${source_commit}^{commit}" || fail "pinned source commit is unavailable"
test "$(git show "${source_commit}:programs/escrow_v3/src/lib.rs" | shasum -a 256 | awk '{print $1}')" = "$expected_source_sha" || fail "source commit does not contain pinned source"
test "$(git show "${source_commit}:Cargo.lock" | shasum -a 256 | awk '{print $1}')" = "$expected_lock_sha" || fail "source commit does not contain pinned Cargo.lock"

test "$(rustc --version | awk '{print $2}')" = "1.86.0" || fail "rustc must be 1.86.0"
test "$(cargo --version | awk '{print $2}')" = "1.86.0" || fail "cargo must be 1.86.0"

if ! command -v solana >/dev/null 2>&1; then
  pinned_solana_bin="$HOME/.local/share/solana/install/releases/2.1.21/solana-release/bin"
  test -x "$pinned_solana_bin/solana" || fail "Solana CLI 2.1.21 is not installed"
  export PATH="$pinned_solana_bin:$PATH"
fi

solana --version | grep -q 'solana-cli 2.1.21 ' || fail "Solana CLI must be 2.1.21"
cargo-build-sbf --version | grep -q 'solana-cargo-build-sbf 2.1.21' || fail "cargo-build-sbf must be 2.1.21"

temp_parent="${TMPDIR:-/tmp}"
temp_parent="${temp_parent%/}"
build_root="$(mktemp -d "$temp_parent/satp-escrow-v3-locked.XXXXXX")"
cleanup() {
  trap - EXIT
  case "$build_root" in
    "$temp_parent"/satp-escrow-v3-locked.*) rm -rf "$build_root" ;;
    *) echo "escrow_v3 locked mainnet build: refusing to remove unexpected temporary path $build_root" >&2 ;;
  esac
}
trap cleanup EXIT

# Build the immutable git object, not the pull-request checkout. This makes
# later edits to Cargo.toml, build.rs, or any transitive workspace input unable
# to change the artifact without first changing the pinned commit.
git archive "$source_commit" | tar -x -C "$build_root"
test "$(shasum -a 256 "$build_root/programs/escrow_v3/src/lib.rs" | awk '{print $1}')" = "$expected_source_sha" || fail "archived source differs from pinned source"
test "$(shasum -a 256 "$build_root/Cargo.lock" | awk '{print $1}')" = "$expected_lock_sha" || fail "archived Cargo.lock differs from pinned lock"

cd "$build_root"
cargo build-sbf --tools-version v1.52 --manifest-path programs/escrow_v3/Cargo.toml --features mainnet 2>&1 | tee "$repo_root/build-sbf-mainnet-locked.log"

artifact="$build_root/target/deploy/escrow_v3.so"
actual_artifact_sha="$(shasum -a 256 "$artifact" | awk '{print $1}')"
actual_artifact_bytes="$(stat -f '%z' "$artifact")"
test "$actual_artifact_sha" = "$expected_artifact_sha" || fail "artifact sha256=$actual_artifact_sha expected=$expected_artifact_sha"
test "$actual_artifact_bytes" = "$expected_artifact_bytes" || fail "artifact bytes=$actual_artifact_bytes expected=$expected_artifact_bytes"

mkdir -p "$repo_root/target/deploy"
cp "$artifact" "$repo_root/target/deploy/escrow_v3.so"
cd "$repo_root"
node scripts/verify-escrow-v3-mainnet-locked.mjs --artifact

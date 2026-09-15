#!/usr/bin/env bash
set -euo pipefail

requested_tools_version="v1.52"
expected_cargo_version="1.89.0"

fail() {
  echo "SBF platform-tools preflight failed: $*" >&2
  exit 1
}

command -v cargo-build-sbf >/dev/null 2>&1 || fail "cargo-build-sbf is unavailable"
command -v rustup >/dev/null 2>&1 || fail "rustup is unavailable"

solana_bin="$(cd "$(dirname "$(command -v cargo-build-sbf)")" && pwd)"
sbf_sdk="$solana_bin/sdk/sbf"
sdk_install="$sbf_sdk/scripts/install.sh"
platform_tools_rust="$sbf_sdk/dependencies/platform-tools/rust"

test -f "$sdk_install" || fail "Solana SBF installer is unavailable"

declared_version="$(awk '/# Install platform tools/{seen=1; next} seen && /^version=/{sub(/^version=/, ""); print; exit}' "$sdk_install")"
if [ "$declared_version" != "$requested_tools_version" ]; then
  perl -0pi -e "s/(# Install platform tools\nversion=)v[0-9.]+/\${1}${requested_tools_version}/" "$sdk_install"
fi

declared_version="$(awk '/# Install platform tools/{seen=1; next} seen && /^version=/{sub(/^version=/, ""); print; exit}' "$sdk_install")"
test "$declared_version" = "$requested_tools_version" || fail "installer did not select $requested_tools_version"

# Solana 2.1.21 asks Cargo for workspace metadata before it installs the
# --tools-version requested by cargo build-sbf. Prepare and link that toolchain
# first so a stale global `solana` alias cannot run Cargo 1.79.0.
"$sdk_install"
test -x "$platform_tools_rust/bin/cargo" || fail "$requested_tools_version Cargo is unavailable"

actual_cargo_version="$(cargo +solana --version 2>/dev/null | awk '{print $2}' || true)"
if [ "$actual_cargo_version" != "$expected_cargo_version" ]; then
  rustup toolchain uninstall solana >/dev/null 2>&1 || true
  rustup toolchain link solana "$platform_tools_rust" >/dev/null
  actual_cargo_version="$(cargo +solana --version 2>/dev/null | awk '{print $2}' || true)"
fi

test "$actual_cargo_version" = "$expected_cargo_version" || fail "cargo +solana is $actual_cargo_version, expected $expected_cargo_version"
echo "SBF platform-tools preflight: $requested_tools_version / cargo $actual_cargo_version"

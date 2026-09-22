#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Only escrow_v3 has a source commit proven to reproduce deployed bytes. The
# workflow builds that pinned source first; this step reads all six programs and
# checks immutable deployed values without treating the other five known source
# gaps as failures. If the escrow artifact is absent, the verifier still writes
# a complete NOT_COMPARED proof before failing.
node "$root/scripts/verify-v3-deployed-programs.mjs"

#!/usr/bin/env python3
"""Parse all SATP IDL JSON files without contacting Solana networks."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
idl_files = sorted((ROOT / "idls").rglob("*.json"))
if not idl_files:
    raise SystemExit("no IDL JSON files found")
for path in idl_files:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise SystemExit(f"{path}: expected JSON object")
    if "name" not in data and "metadata" not in data:
        raise SystemExit(f"{path}: missing IDL name/metadata")
    print(f"ok {path.relative_to(ROOT)}", flush=True)
print(f"validated {len(idl_files)} IDL JSON files", flush=True)

subprocess.run(
    ["node", "scripts/generate-v3-idls.mjs", "--check"],
    cwd=ROOT,
    check=True,
)

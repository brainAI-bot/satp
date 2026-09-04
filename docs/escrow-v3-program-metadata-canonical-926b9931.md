# Escrow V3 Program Metadata Canonical Read Path

Marker: [#926b9931]

Status: read-only proof. This note records the current mainnet escrow IDL read
path for Anchor 1.0 consumers. It authorizes no Solana transaction simulation or
submission, chain write, signer or key access, deploy, restart, npm publish,
credential change, admin mutation, paid spend, or public action.

## Mainnet ProgramData

- Program: `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C`.
- ProgramData: `Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk`.
- Upgrade slot: `442907465`.
- ProgramData account bytes: `357141`.
- Allocated payload bytes: `357096`.
- Allocated payload SHA-256:
  `7672bd30bf01134bc56e088013a5cafd65ff850c402a56e532be3e28a3d5b4c9`.
- Verified source artifact prefix bytes: `350304`.
- Verified source artifact prefix SHA-256:
  `27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a`.
- Allocation padding bytes: `6792`.

`scripts/verify-escrow-v3-deployed-truth.mjs --live` verified the deployed
payload prefix against the recorded source build and confirmed no live drift at
finalized RPC slot `444347726`.

## IDL Read-Path Boundary

`idls/v3/escrow_v3.json` remains the canonical repository IDL generated from
verified source commit `3f8188bec89db0d4a081931f35272e10185d1c0d`. It names
program `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C`, contains 14
instructions, and has SHA-256
`9bb7e2a441af653108b21360a8aa14daa9bd8d54eebbc5eef88e7f3de881ba10`.

Anchor 1.0 consumers must use Program Metadata account
`4zNAR5DGuWuUnEbwGb7FzEVUUCx2xKca2bmHCeVpjQCJ` as the canonical on-chain IDL
read path. Read-only account decode verified:

- owner `ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S`;
- canonical JSON SHA-256
  `d4d00143fdb5e755c68b484a428fc02bdf5d0a0000c7a8d7ea2712bff2da92ce`;
- 14 current escrow instructions.

The legacy Anchor 0.31 IDL account
`D2TVCWarEDQ3w3YFMpackzymm9MGQKeWd1p1pCeZmBcn` is not canonical. Read-only
decode verified SHA-256
`864e8af057c1b196156222ecda5853936bf4c6e0f3ae9f5c1e2ca2e53ed6c768` and only
9 SOL-era instructions. Legacy readers must fail closed or label this account
stale/non-canonical.

The Program Metadata JSON is not byte-identical to the committed repository IDL.
The canonical comparison is therefore the resolved program address and
instruction surface, not byte-for-byte equality with the repo artifact.

## Consumer Readback

Read-only AgentFolio checks on 2026-09-04 found:

- `https://agentfolio.bot` returned HTTP 200.
- `/api/satp/programs` advertises escrow
  `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` and does not expose the stale
  legacy Anchor IDL account as the runtime program.
- `/api/v3/escrow/health` reports Program Metadata
  `4zNAR5DGuWuUnEbwGb7FzEVUUCx2xKca2bmHCeVpjQCJ`, stale legacy Anchor IDL
  `D2TVCWarEDQ3w3YFMpackzymm9MGQKeWd1p1pCeZmBcn`, and live escrow writes
  disabled.

This proves read-path resolution only. AgentFolio product unpause, live escrow,
payment handling, dependency changes, and marketplace policy changes remain
blocked until a separate AgentFolio-owned gate authorizes them.

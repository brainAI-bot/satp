# Escrow V3 Mainnet Rider Outcome

Status: runtime upgrade finalized; Anchor 1.0 Program Metadata IDL publication
is reconciled as the canonical on-chain read path.
This record authorizes no Solana write, deploy, IDL publish, signer access,
authority change, AgentFolio product change, or retry.

## Finalized runtime truth

- Program: `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C`.
- ProgramData: `Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk`.
- Upgrade slot: `442907465`.
- Upgrade signature:
  `3RBnKDDQuMv3VkUTSC4FHT8Qyk87xBJXUebkYCDenc1ApfTZP5PeFS32rRBsCLgQQLitBX9tYHhXprNw1C5KZd7y`.
- Deployed source: SATP commit
  `3f8188bec89db0d4a081931f35272e10185d1c0d`, built with Solana CLI
  `2.1.21`, platform-tools `v1.52`, and feature `mainnet`.
- Rebuilt artifact: 350304 bytes, SHA-256
  `27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a`.
- ProgramData allocation: 357096 bytes, SHA-256
  `7672bd30bf01134bc56e088013a5cafd65ff850c402a56e532be3e28a3d5b4c9`.
  The deployed artifact is its exact prefix; the 6792-byte suffix is all zeroes.
- Canonical repository IDL: `idls/v3/escrow_v3.json`, 14 instructions,
  SHA-256 `9bb7e2a441af653108b21360a8aa14daa9bd8d54eebbc5eef88e7f3de881ba10`.

## Fail-closed publication boundary

The runtime contains SOL fee routing and the five SPL/USDC entrypoints:
`create_usdc_escrow`, `release_usdc`, `partial_release_usdc`, `cancel_usdc`,
and `resolve_dispute_usdc`.

Published IDL truth is split by reader generation:

- Anchor 1.0 Program Metadata account
  `4zNAR5DGuWuUnEbwGb7FzEVUUCx2xKca2bmHCeVpjQCJ` is canonical for on-chain
  IDL reads and exposes the current 14-instruction escrow set.
- Legacy Anchor 0.31 IDL account
  `D2TVCWarEDQ3w3YFMpackzymm9MGQKeWd1p1pCeZmBcn` remains stale at 9
  instructions and must be labeled stale or fail closed.

The Program Metadata JSON is not byte-identical to `idls/v3/escrow_v3.json`, so
consumers and tests compare the resolved program address and instruction surface
rather than treating legacy Anchor fetch output as authoritative. Consumer
escrow unpause remains false and AgentFolio money-moving routes remain gated
until a separate AgentFolio-owned unpause gate verifies product behavior.

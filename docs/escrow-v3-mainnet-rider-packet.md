# Escrow V3 Mainnet Rider Outcome

Status: runtime upgrade finalized; canonical IDL publication is not reconciled.
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

Publication is not reconciled:

- the legacy Anchor IDL remains stale at 9 instructions; and
- the Program Metadata IDL has 14 instructions but omits the required
  `treasury` account from `release` and `partial_release`.

Therefore consumer escrow unpause remains false and AgentFolio money-moving
routes remain gated. Any future IDL publication requires a separate HQ task and
exact Owner approval. After such a write, CI must show the published canonical
IDL equals `idls/v3/escrow_v3.json` at finalized commitment before consumers can
be considered for independent unpause verification.

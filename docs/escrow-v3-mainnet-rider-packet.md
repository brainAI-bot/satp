# Escrow V3 Owner-Gated Mainnet Riders

Status: prepared, not executed. No Solana write, deploy, IDL publish, signer
access, authority change, or AgentFolio product change is authorized here.

## Current deployed truth

- Program: `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C`.
- ProgramData: `Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk`.
- Deployed source: SATP commit
  `0bf088e5618f173dff7e0fba622bc2911212c52e` built with Solana CLI
  `2.1.21`, platform-tools `v1.52`, and feature `mainnet`.
- Rebuilt and deployed artifact: 346856 bytes, SHA-256
  `4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d`.
- Canonical repository IDL: `idls/v3/escrow_v3.json`, 14 instructions,
  SHA-256 `e8c142f27e225d8edc2f8f41e6fb698ebbb73f69d2fc078d5bf963234ebc8fa9`.
- Published Anchor IDL account remains stale at 9 instructions. Consumers must
  not treat it as the canonical interface.

## Riders prepared for the next separately approved write

The current SATP source head contains both changes that must travel together in
the next reviewed, Owner-approved mainnet redeploy packet:

1. SOL release and partial-release fee routing to the fixed treasury account.
2. The five SPL/USDC entrypoints already present at the program layer:
   `create_usdc_escrow`, `release_usdc`, `partial_release_usdc`, `cancel_usdc`,
   and `resolve_dispute_usdc`.

The source-head IDL is recorded separately at
`idls/source-head/escrow_v3.json`. It is not the deployed canonical IDL. The
source-head artifact is 350304 bytes with SHA-256
`27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a` and
requires 10240 additional ProgramData bytes before a future upgrade.

## Required future Owner gate

A separate HQ task and exact Owner approval must name the program ID, signer
owner, reviewed artifact hash, ProgramData extension, deploy/upgrade command,
IDL publish command, rollback artifact, canary limits, and post-write proof.
After that write, CI must show the new source artifact equals a fresh program
dump and the published IDL equals the reviewed source-head IDL. Until then:

- fee routing is not deployed;
- the USDC/SPL surface is not approved for consumer use;
- consumer escrow unpause is false; and
- AgentFolio money-moving routes remain gated.

# SATP Mainnet Authority Decision Packet [#6c8a5545]

Status: Owner decision packet only. This document does not approve, execute, or prepare a Solana write, devnet deploy, mainnet deploy, keypair action, signer import/export, npm publish, paid spend, credential/admin action, production mutation, or public launch.

Prepared by: brainChain
Date: 2026-07-05

## Scope

This packet covers the SATP V3 program suite and authority model needed before any Owner mainnet decision. The current live deploy truth is manual Anchor deployment, devnet today, with no push-to-ship pipeline and no mainnet deploy enabled.

Owner decision update, 2026-07-06: the SATP upgrade-authority key remains one sole Owner-held key. There is no upgrade-authority multisig and no agent co-signer. The prior audit recommendation for upgrade-authority multisig is declined and risk-accepted. This update reconciles the active readiness docs to the decision recorded in `ROADMAP.md` without changing `ROADMAP.md`.

In scope:

| Area | Current source | Mainnet decision status |
| --- | --- | --- |
| V3 devnet program IDs | `packages/satp-client/src/v3-pda.js` | Existing devnet readback only; not a mainnet approval. |
| V3 mainnet SDK program IDs | `packages/satp-client/src/v3-pda.js` | D1 SDK wiring approved by HQ task `TASK-30ec9d53` / `[#bd298672]` for the six identifiers listed in the D1 SDK wiring update below; not a deploy approval. |
| Mainnet authority classes | `docs/mainnet-authority-readiness.md`, `docs/key-management.md` | Owner-gated; public authority addresses still pending. |
| Legacy V2 mainnet constants | `packages/satp-client/src/constants.js` | Read back for risk awareness only; not treated as the V3 mainnet target. |

Out of scope: deploy execution, keypair creation or movement, authority rotation, npm publish, AgentFolio product work, paid spend, and any ROADMAP status flip.

## D1 SDK Wiring Update

HQ task `TASK-30ec9d53` / `[#bd298672]` authorizes the SDK-only D1 wiring milestone for `packages/satp-client/src/v3-pda.js`. The SDK may expose exactly these six V3 program IDs from `getV3ProgramIds('mainnet')`:

| Program | V3 mainnet SDK program ID |
| --- | --- |
| Identity V3 | `GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG` |
| Reviews V3 | `r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4` |
| Reputation V3 | `2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ` |
| Attestations V3 | `6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD` |
| Validation V3 | `6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV` |
| Escrow V3 | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` |

This SDK wiring does not approve or perform a Solana write, devnet deploy, mainnet deploy, keypair action, signer import/export, authority rotation, npm publish, production mutation, paid spend, or public launch. Legacy V2 `MAINNET_PROGRAM_IDS` in `packages/satp-client/src/constants.js` remain separate and are not a fallback source for V3.

## Public Authority Inventory

### V3 Devnet Program Readback

Read-only JSON-RPC was used because this environment did not have the `solana` or `anchor` CLI installed. No keypair, signer, transaction, or deploy command was used.

Command proof:

```text
solana --version
zsh:1: command not found: solana

anchor --version
zsh:1: command not found: anchor
```

Readback command shape:

```text
NODE_PATH=/Users/brainchain/satp/node_modules node <read-only JSON-RPC script>
RPC: https://api.devnet.solana.com
Method: getAccountInfo, commitment=confirmed
BPF loader: BPFLoaderUpgradeab1e11111111111111111111111
```

Results:

| Program | Program ID | ProgramData | Upgrade authority | Readback result |
| --- | --- | --- | --- | --- |
| Identity V3 | `GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG` | `DcWi5LYdfRQS5wJo5BWGANt2FcayQNecHmpL6P9p1jAL` | `nwtiXZq8Y7qVDUTLUZ2sjCp1MmXyZm7HDmTNL9fmueT` | Executable, upgradeable, ProgramData slot `452477426`. |
| Reviews V3 | `r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4` | `8NEkNwSTFzj5EyJh7NCGNUUY4n9Zfpi5vKb72YJGYmYR` | Unknown from this readback | Program executable; ProgramData account returned missing. |
| Reputation V3 | `2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ` | `DYxB3qZQKc2rcbnJCdBoEMFunJF4oonLtEbuhXhXJQ1x` | Unknown from this readback | Program executable; ProgramData account returned missing. |
| Attestations V3 | `6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD` | `HAtBvBFtuz54PaVf4cX1KiZhy9qaJo355TAs1HJW5VU1` | Unknown from this readback | Program executable; ProgramData account returned missing. |
| Validation V3 | `6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV` | `4J7KCbKnS1EWJyWhdxodmtZcLgCNpSAYXVUMhmjw1TeT` | Unknown from this readback | Program executable; ProgramData account returned missing. |
| Escrow V3 | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` | `Fg1DJyKX9CngiMihZxJY2zjaQ8T1PK5QuiVhNvJmeTqk` | Unknown from this readback | Program executable; ProgramData account returned missing. |

Additional devnet account readback at slot `474238008`, block height `462079664`, epoch `1097`:

| Account | Address | Exists | Owner | Notes |
| --- | --- | --- | --- | --- |
| Reputation authority PDA | `CTeP5HYLxyvcKgmDzmJd959Rvk6d61gqq5GYDbF1vye4` | No | n/a | Derived from seed `reputation_v3_authority`; PDA does not need a standalone account unless program design creates one. |
| Validation authority PDA | `HsCjSEHL6NvzgU8juYMH7CFgEE72o392xdp1CiiJqjcP` | No | n/a | Derived from seed `validation_v3_authority`; PDA does not need a standalone account unless program design creates one. |
| Sample `brainChain` Genesis PDA | `4K5nB6tovMHb2Nh4w9hBHEX7hAK6wqcdFSqvNSGn17NK` | Yes | `GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG` | Public devnet sample account, `1384` bytes, non-executable. |

### V3 Mainnet Authority Inventory

V3 mainnet SDK program IDs are configured only for D1 client identifier wiring. Mainnet deploy, authority movement, funding, and production use remain disabled until the Owner approves public authority addresses and custody.

| Mainnet authority class | Required public identifier | Required custody | Current status |
| --- | --- | --- | --- |
| Program upgrade authority | Owner-approved public key | Sole Owner-held key; no multisig; no agent co-signer | Custody model decided by Owner; public key still pending before any mainnet action. |
| Fee payer | Limited-balance operational public key | Separate fee-payer key with replenishment limits | Pending Owner approval. |
| Issuer registry root | Public issuer-admin authority | Multisig/governance with issuer admission policy | Pending Owner approval. |
| Trust-class administrator | Public trust-class authority | Governance or policy-bound administrator | Pending Owner approval. |
| Escrow/funds authority | Public funds/vault authority | Separate multisig/governance or program-derived vault authority | Pending Owner approval and escrow design review. |
| Dispute authority | Public dispute authority | Separate dispute multisig or governed council | Pending Owner approval and dispute policy. |
| Pause/freeze authority, if present | Public emergency authority | Time-limited multisig/governance | Pending Owner approval and emergency policy. |

### Legacy V2 Mainnet Readback

The SDK still contains legacy V2 mainnet constants. These are not the V3 mainnet target, but they are relevant authority risk context because they are public SATP constants in the package.

Read-only RPC: `https://api.mainnet-beta.solana.com`, `getAccountInfo`, `confirmed`.

| Legacy program | Program ID | ProgramData | Upgrade authority | Status |
| --- | --- | --- | --- | --- |
| Identity V2 | `97yL33fcu6iWT2TdERS5HeqrMSGiUnxuy6nUcTrKieSq` | `DFa564Wr81TgZ1fGuC2vsoxQzpvW6YJJ2BuFV3wDf7VG` | `CSyppbZuGJ4syJcNgyFFhCc3qgbWNWJyL2Y195MNS6J7` | Upgradeable. |
| Reviews V2 | `Ge1sD2qwmH8QaaKCPZzZERvsFXNVMvKbAgTp2p17yjLK` | `DEqiuDrR9pYyV6C16sk9NrbpmCLY5vQZ1EjiVqE4AmRu` | `CSyppbZuGJ4syJcNgyFFhCc3qgbWNWJyL2Y195MNS6J7` | Upgradeable. |
| Reputation V2 | `C9ogv8TBrvFy4pLKDoGQg9B73Q5rKPPsQ4kzkcDk6Jd` | `8M9R3Ccbbr6eLWbs2PagB6iuKG8jbfzUphf6FGDAVbYv` | `CSyppbZuGJ4syJcNgyFFhCc3qgbWNWJyL2Y195MNS6J7` | Upgradeable. |
| Attestations V2 | `ENvaD19QzwWWMJFu5r5xJ9SmHqWN6GvyzxACRejqbdug` | `3m2jKxUCo8XudjXYqKsWhNmh83S9vYphmU1zimLyYy1M` | `CSyppbZuGJ4syJcNgyFFhCc3qgbWNWJyL2Y195MNS6J7` | Upgradeable. |
| Validation V2 | `9p795d2j3eGqzborG2AncucWBaU6PieKxmhKVroV3LNh` | `5rPvh32ypHcYfRH2jb7ofvp7Yr4KpyMbXbcWkZHS4Qjj` | `CSyppbZuGJ4syJcNgyFFhCc3qgbWNWJyL2Y195MNS6J7` | Upgradeable. |

## Upgrade Custody Decision

Superseded recommendation: the earlier recommendation to choose a hardware-backed multisig or governance account for V3 mainnet upgrade authority is no longer active. The Owner declined that recommendation and accepted the single-key custody risk.

Current Owner decision:

1. Keep the SATP upgrade-authority key as a sole Owner-held key.
2. Do not add an upgrade-authority multisig.
3. Do not add an agent co-signer or agent-controlled upgrade authority.
4. Separate upgrade authority from fee payer, issuer registry root, trust-class administrator, funds authority, dispute authority, and emergency authority.
5. Before any mainnet deploy or value-bearing action, require the Owner-approved public upgrade-authority address, command plan, rollback criteria, and final readback evidence.
6. Keep V3 mainnet deploy, production use, and authority actions disabled until conformance tests and brainShield review pass.

## Fee-Payer And Funding Runbook

The fee payer must be operational only and must not control protocol authority.

Before any mainnet fee-payer action:

1. Owner approves one public fee-payer address and max funding limit in HQ.
2. brainShield confirms it is not equal to any upgrade, issuer, trust-class, funds, dispute, or emergency authority address.
3. Funding uses a limited balance sized for the approved operation only.
4. Read-only verification records the public balance before and after the approved operation.
5. Replenishment requires a new HQ approval if it exceeds the approved limit or purpose.
6. SDK read-only helpers continue to avoid auto-loading or inferring a fee payer.

Abort funding if the fee-payer address is also an authority, if replenishment limits are missing, if the command plan would reveal a keypair path or secret, or if the action depends on an implicit default signer.

## Rollback And Abort Criteria

Abort before mainnet if any of the following is true:

- V3 mainnet program IDs are not explicitly approved in a PR and HQ evidence.
- Upgrade custody is not the Owner-approved sole Owner-held key, uses an agent co-signer, uses a CI secret, uses a default Anchor wallet, or is an unknown authority.
- Any required public authority address is missing or cannot be read back.
- Fee payer overlaps with upgrade, issuer, trust-class, funds, dispute, or emergency authority.
- Conformance tests fail or do not cover third-party read-only verification.
- `anchor` or Solana readback commands cannot be reproduced from a reviewed environment.
- Devnet ProgramData readback remains incomplete for programs intended to be promoted without a fresh deployment and verification plan.
- Escrow/funds custody or dispute policy is unresolved.
- The command plan requires a secret, keypair path, raw `.env` value, token, paid spend, public launch, npm publish, or production mutation not explicitly approved in HQ.

Containment after an approved mainnet action must include public readback of program IDs, ProgramData accounts, upgrade authority, fee-payer balance, transaction signatures, and any emergency/freeze state. Rollback must prefer authority transfer or emergency freeze according to the pre-approved plan; no ad hoc redeploy should be attempted from local state.

## Risks And Unknowns

| Risk or unknown | Impact | Required resolution |
| --- | --- | --- |
| V3 mainnet SDK IDs are wired before deployment approval | Clients can resolve configured identifiers, but no mainnet deploy or production use can proceed. | Keep deploy, authority, funding, and production actions Owner-gated after brainShield review. |
| V3 devnet ProgramData readback was incomplete for Reviews, Reputation, Attestations, Validation, and Escrow | Upgrade authority cannot be confirmed from this public RPC readback for those devnet programs. | Re-run with Solana CLI or an alternate public RPC before using these programs as promotion evidence. |
| Identity V3 devnet upgrade authority is a single public key in readback | Devnet readback does not prove the Owner-approved mainnet key. | Mainnet must use the Owner-approved sole Owner-held upgrade-authority public key with no multisig and no agent co-signer. |
| Legacy V2 mainnet programs are upgradeable under one authority | Existing public constants carry authority concentration risk. | Treat as legacy/out-of-scope for V3 launch, or create a separate V2 retirement/ownership review. |
| Escrow/funds custody model remains open | Value movement risk if launched without policy. | Decide program-controlled vault vs governance-controlled vault in a reviewed design. |
| Dispute and emergency policies are not final | Incident response could become arbitrary or overpowered. | Approve public trigger, quorum, unfreeze, and post-incident evidence rules before launch. |

## Pending Owner Approval Request

Request ID: `OWNER-MAINNET-AUTHORITY-6c8a5545`

Requested Owner action, and no other action: approve the public mainnet authority plan for SATP V3 by naming the exact public key for the sole Owner-held upgrade authority, plus the exact public keys or governance accounts for fee payer, issuer registry root, trust-class administrator, escrow/funds authority, dispute authority, and pause/freeze authority if present.

This approval must also state that:

- no mainnet deploy is approved until brainShield review and conformance evidence pass;
- no keypair generation, import, export, movement, or rotation is approved by this packet;
- no npm publish, paid spend, production deploy/restart, public launch, or client commitment is approved by this packet;
- the final deploy runbook must be separately approved with commands, rollback criteria, and post-action readback evidence.

## Non-Execution Readback

This PR changed documentation only. It did not edit `ROADMAP.md`, runtime code, package metadata, deploy configuration, keypair material, `.env` files, npm settings, Solana state, or production services.

Explicit readback for this cycle:

```text
no-mainnet-write: true
no-devnet-write: true
no-keypair-action: true
no-deploy: true
no-npm-publish: true
no-credential-action: true
no-paid-action: true
```

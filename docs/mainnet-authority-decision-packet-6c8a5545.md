# SATP Mainnet Authority Decision Packet [#6c8a5545]

Status: Owner decision packet only. This document records public mainnet authority evidence and ratification decisions. It does not approve, execute, or prepare a Solana write, devnet deploy, mainnet deploy, keypair action, signer import/export, npm publish, paid spend, credential/admin action, production mutation, or public launch.

Prepared by: brainChain
Date: 2026-07-05
Authority evidence update: 2026-07-08

## Scope

This packet covers the live SATP mainnet authority model for the six V3 programs and five legacy V2 programs. It replaces the earlier packet framing that treated mainnet as pending, disabled, or only devnet-oriented. SATP mainnet has been live since 2026-03; this packet asks the Owner to ratify the observed public authorities and required separations, not to name a future key and not to authorize a new deploy.

Owner decision update, 2026-07-06: the SATP upgrade-authority key remains one sole Owner-held key. There is no upgrade-authority multisig and no agent co-signer. The prior audit recommendation for upgrade-authority multisig is declined and risk-accepted. This update reconciles the decision packet to the mainnet authority audit without changing `ROADMAP.md`.

In scope:

| Area | Current source | Mainnet decision status |
| --- | --- | --- |
| V3 mainnet program IDs | `packages/satp-client/src/v3-pda.js` | Live mainnet identifiers since 2026-03; Owner should ratify the current authority inventory. |
| Legacy V2 mainnet constants | `packages/satp-client/src/constants.js` | Live legacy mainnet programs; included in the same upgrade-authority ratification. |
| Upgrade authority | Mainnet ProgramData audit evidence | Ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc` for all 11 programs. |
| Operational fee payer | `docs/key-management.md`, `config/satp-operational-signer.public.json` | Ratify `8N3WfudPvGtJT775SSt5qxE24vFEAaCHzepMyfnNSA2g` as a limited operational fee payer only. |
| Treasury custody | Mainnet authority audit evidence | Name `FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be` as a separate 12th custody key. |

Out of scope: deploy execution, keypair creation or movement, authority rotation, npm publish, AgentFolio product work, paid spend, and any ROADMAP status flip.

## Mainnet Program Inventory

The SDK exposes these six V3 program IDs from `getV3ProgramIds('mainnet')`. They are live mainnet programs, not merely future SDK wiring targets.

| Program | V3 mainnet program ID | Upgrade-authority decision |
| --- | --- | --- |
| Identity V3 | `GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG` | Ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. |
| Reviews V3 | `r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4` | Ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. |
| Reputation V3 | `2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ` | Ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. |
| Attestations V3 | `6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD` | Ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. |
| Validation V3 | `6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV` | Ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. |
| Escrow V3 | `B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg` | Ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`; escrow is live and must be ratified or migrated. |

The SDK also contains these five legacy V2 mainnet constants. They are not the V3 target surface, but they are live SATP mainnet programs and are included in the 11-program authority ratification.

| Legacy program | Program ID | Upgrade-authority decision |
| --- | --- | --- |
| Identity V2 | `97yL33fcu6iWT2TdERS5HeqrMSGiUnxuy6nUcTrKieSq` | Correct previous obsolete authority claim; ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. |
| Reviews V2 | `Ge1sD2qwmH8QaaKCPZzZERvsFXNVMvKbAgTp2p17yjLK` | Correct previous obsolete authority claim; ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. |
| Reputation V2 | `C9ogv8TBrvFy4pLKDoGQg9B73Q5rKPPsQ4kzkcDk6Jd` | Correct previous obsolete authority claim; ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. |
| Attestations V2 | `ENvaD19QzwWWMJFu5r5xJ9SmHqWN6GvyzxACRejqbdug` | Correct previous obsolete authority claim; ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. |
| Validation V2 | `9p795d2j3eGqzborG2AncucWBaU6PieKxmhKVroV3LNh` | Correct previous obsolete authority claim; ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`. |

## Authority Inventory

| Authority class | Public identifier | Decision |
| --- | --- | --- |
| Program upgrade authority for all 11 programs | `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc` | Ratify as the current sole Owner-held upgrade authority; do not treat this as a request to name a future key. |
| Operational fee payer | `8N3WfudPvGtJT775SSt5qxE24vFEAaCHzepMyfnNSA2g` | Ratify only as a low-privilege operational fee payer with capped funding and replenishment limits approved in HQ before use. |
| Treasury custody key | `FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be` | Name as a separate 12th custody key; it must remain distinct from upgrade authority and fee payer. |
| Issuer registry root | Hot-key-gated | Ratify current state as hot-key-gated and require a later governance migration plan before expanded issuer administration. |
| Trust-class administrator | `NOT_PRESENT` | Ratify absence; do not invent or provision an authority in this packet. |
| Dispute authority | `NOT_PRESENT` | Ratify absence; do not invent or provision an authority in this packet. |
| Pause/freeze authority | `NOT_PRESENT` | Ratify absence; do not invent or provision an authority in this packet. |
| Escrow/funds authority | Live escrow surface | Ratify current live escrow state or migrate it under a separately reviewed custody plan. |

The operational fee payer must not control program upgrades, key management, issuer root authority, treasury custody, escrow/funds custody, dispute authority, pause/freeze authority, deploys, npm publishing, or authority transfers.

## Upgrade Custody Decision

Superseded recommendation: the earlier recommendation to choose a hardware-backed multisig or governance account for SATP upgrade authority is no longer active. The Owner declined that recommendation and accepted the single-key custody risk.

Current ratification decision:

1. Ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc` as the current upgrade authority for all six V3 mainnet programs and all five legacy V2 mainnet programs.
2. Keep the SATP upgrade-authority key as a sole Owner-held key.
3. Do not add an upgrade-authority multisig.
4. Do not add an agent co-signer or agent-controlled upgrade authority.
5. Separate upgrade authority from fee payer, issuer registry root, trust-class administrator, treasury custody, escrow/funds authority, dispute authority, and emergency authority.
6. Treat the legacy V2 authority claim as retracted for this packet.
7. Require brainShield review before the Owner signs `REQ-95b3cba7`.

## Fee-Payer And Funding Runbook

The fee payer is:

```text
8N3WfudPvGtJT775SSt5qxE24vFEAaCHzepMyfnNSA2g
```

It must remain operational only and must not control protocol authority.

Before any fee-payer action:

1. Owner approval in HQ must state the purpose, maximum funding cap, replenishment limit, and expiration.
2. brainShield confirms the fee payer is not equal to the upgrade authority, treasury custody key, issuer root, trust-class authority, escrow/funds authority, dispute authority, or emergency authority.
3. Funding uses a limited balance sized for the approved operation only.
4. Read-only verification records the public balance before and after the approved operation.
5. Replenishment requires a new HQ approval if it exceeds the approved limit or purpose.
6. SDK read-only helpers continue to avoid auto-loading or inferring a fee payer.

Abort funding if the fee-payer address is also an authority, if replenishment limits are missing, if the command plan would reveal a keypair path or secret, or if the action depends on an implicit default signer.

## Treasury And Escrow Decision

The treasury custody key is:

```text
FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be
```

This is a separate 12th custody key and must not be collapsed into the 11-program upgrade-authority inventory. Escrow is live. The Owner decision is to ratify the current live escrow/funds state or request a separate migration plan; this packet does not execute or approve a migration.

## Rollback And Abort Criteria

Abort any later mainnet authority action if any of the following is true:

- The action would use an upgrade authority other than `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc` without a separately approved rotation plan.
- The fee payer overlaps with upgrade authority, treasury custody, issuer root, trust-class, escrow/funds, dispute, or emergency authority.
- The treasury custody key is omitted from the authority inventory or treated as one of the 11 program authorities.
- The issuer-root hot-key gate is not acknowledged before issuer administration expands.
- Trust-class administrator, dispute authority, or pause/freeze authority are invented without a separate reviewed design.
- Conformance tests fail or do not cover third-party read-only verification.
- The command plan requires a secret, keypair path, raw `.env` value, token, paid spend, public launch, npm publish, or production mutation not explicitly approved in HQ.

Containment after any separately approved mainnet action must include public readback of program IDs, ProgramData accounts, upgrade authority, fee-payer balance, treasury custody, transaction signatures, and any emergency/freeze state. Rollback must prefer authority transfer or emergency freeze according to the pre-approved plan; no ad hoc redeploy should be attempted from local state.

## Risks And Unknowns

| Risk or unknown | Impact | Required resolution |
| --- | --- | --- |
| Eleven live programs share one upgrade authority | Owner-held single-key concentration is accepted but high impact. | Ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`, keep it out of agent automation, and require brainShield review before signature. |
| Escrow is live | Value movement risk if custody stays under-reviewed. | Ratify current state or request a separate migration plan. |
| Operational fee payer has a public key but no cap in this packet | Uncapped replenishment could drift into authority or treasury risk. | Require an HQ-approved cap and replenishment limit before any funding. |
| Issuer root is hot-key-gated | Issuer administration could be too centralized. | Require later governance migration before expanded issuer administration. |
| Trust, dispute, and pause/freeze authorities are not present | Incident and policy actions may lack dedicated controls. | Ratify `NOT_PRESENT` now and design any future authority separately. |

## Pending Owner Approval Request

Request ID: `OWNER-MAINNET-AUTHORITY-6c8a5545`

Requested Owner action, and no other action:

1. Ratify `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc` as the current public upgrade authority for all 11 SATP mainnet programs, six V3 and five V2.
2. Ratify `8N3WfudPvGtJT775SSt5qxE24vFEAaCHzepMyfnNSA2g` as the limited operational fee payer only, with a separately approved funding cap before use.
3. Name `FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be` as the separate 12th treasury custody key.
4. Ratify issuer-root as hot-key-gated.
5. Ratify trust-class administrator, dispute authority, and pause/freeze authority as `NOT_PRESENT`.
6. Ratify live escrow as current state or request a separate migration plan.

This approval must also state that:

- no deploy is approved by this packet;
- no keypair generation, import, export, movement, or rotation is approved by this packet;
- no npm publish, paid spend, production deploy/restart, public launch, or client commitment is approved by this packet;
- the final authority-change runbook, if any, must be separately approved with commands, rollback criteria, and post-action readback evidence.

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

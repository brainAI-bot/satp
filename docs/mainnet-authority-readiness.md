# SATP V3 Mainnet Authority Readiness Model [#e0556f1f]

Status: readiness proposal only. This document does not approve, execute, or prepare a mainnet deploy, devnet deploy, keypair change, signer import/export, Solana write, npm publish, production mutation, funds movement, or public launch.

This model defines the authority boundaries and evidence gates that must be reviewed before brainShield security review and any brainKID or Hani mainnet decision can be considered ripe. It uses public-only placeholders until owners provide approved public addresses through HQ.

## Authority Inventory Placeholders

Do not replace these placeholders with private key material, seed phrases, local keypair paths, secret-store paths, RPC tokens, or raw environment values. Final values must be public keys or public account addresses only.

| Network | Program or module | Authority class | Public identifier | Custody option | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| mainnet | SATP V3 program suite | Upgrade authority | `<mainnet-upgrade-authority-public-key>` | Multisig/governance with hardware-backed signers | Proposed | Owner-gated; no hot-key custody. |
| mainnet | SATP fee payment | Fee payer | `<mainnet-fee-payer-public-key>` | Limited-balance operational key | Proposed | Must not also control upgrade, issuer root, escrow, funds, or dispute authority. |
| mainnet | Issuer registry | Issuer registry root | `<issuer-registry-root-public-key>` | Multisig/governance with documented issuer admission policy | Proposed | Controls issuer-class administration only. |
| mainnet | Trust classes | Trust-class administrator | `<trust-class-admin-public-key>` | Multisig/governance or policy-bound administrator | Proposed | May classify issuers; must not move escrow funds. |
| mainnet | Escrow or funds vaults | Funds authority | `<funds-authority-public-key>` | Separate multisig/governance or program-controlled vault authority | Proposed | Must be independent from upgrade and fee payer authority. |
| mainnet | Escrow disputes | Dispute authority | `<dispute-authority-public-key>` | Separate dispute multisig or governed council | Proposed | Can resolve dispute state according to published policy; cannot unilaterally upgrade programs. |
| mainnet | Emergency controls | Pause or freeze authority | `<pause-freeze-authority-public-key>` | Time-limited multisig/governance with post-incident review | Proposed | Scope must be limited and observable. |

## Upgrade Custody Decision

The proposed mainnet upgrade custody option is multisig/governance with hardware-backed human signers. A single local keypair, server hot wallet, CI secret, or default Anchor wallet is not acceptable for mainnet upgrade authority.

Before any owner approval:

- The multisig or governance mechanism must be documented with public address, quorum, signer role names, recovery model, and rotation path.
- The upgrade authority must be separated from fee payment, issuer administration, funds authority, dispute authority, and emergency authority.
- Any temporary upgrade authority must have an expiry or transfer plan approved in HQ before deployment.
- Verification must use public chain/account data only.

## Fee-Payer Separation

The mainnet fee payer is an operational spending identity, not a protocol authority. It may pay transaction fees for approved operational flows only when explicitly authorized by the caller or runbook.

Required constraints:

- The fee payer must have limited balance and documented replenishment limits.
- The fee payer must not be upgrade authority, issuer registry root, trust-class administrator, funds authority, dispute authority, or emergency authority.
- Read-only SDK helpers must not auto-load or infer a fee payer.
- Build and conformance tests must prove read-only verification works without any fee-payer key.

## Issuer Registry And Trust-Class Boundary

The issuer registry is the source of public issuer admission and revocation state. Trust classes are policy labels used by consumers to interpret issuer standing. These roles are related but distinct.

Boundary rules:

- Issuer registry authority may admit, suspend, or revoke issuer records according to a published policy.
- Trust-class administration may classify issuers or claims but must not mint authority over escrow, funds, program upgrades, or fee payment.
- Consumer applications may choose trust thresholds, but SATP must remain app-agnostic and must not depend on AgentFolio policy or database state.
- Conformance tests must show that a third-party app can verify issuer status and trust class using SATP public state and package APIs only.

## Escrow, Funds Authority, And Dispute Model

Escrow and funds controls require the strongest separation because mistakes can move value.

Proposed model:

- Escrow state must expose public account addresses, settlement terms, dispute status, and relevant transaction references without exposing private keys or secret configuration.
- Funds authority must be separate from upgrade authority, fee payer, issuer registry root, and trust-class administration.
- Dispute authority must be separate from funds authority unless a reviewed governance design explicitly proves quorum separation inside one governance container.
- Dispute resolution must require a documented policy, public event trail, and post-resolution verification evidence.
- Any program-derived vault authority must be documented with seeds, owning program, public account addresses, and verification commands before review.

Open design item before approval: final escrow custody must choose between program-controlled vault authority, governance-controlled vault authority, or another reviewed design. The choice must be made in a later reviewed PR or HQ packet before mainnet approval.

## Emergency And Freeze Plan

Emergency controls may exist only to reduce damage during a live incident. They must not become an unbounded admin backdoor.

Required plan:

- Define whether SATP V3 has pause, freeze, denylist, or circuit-breaker behavior.
- Scope each emergency action to the smallest affected module or account class.
- Assign emergency authority to a multisig/governance address with quorum and recovery rules.
- Publish a trigger policy for suspected key exposure, program exploit, vault accounting fault, issuer compromise, or dispute-system failure.
- Require public evidence after use: affected accounts, transaction signatures, duration, mitigation, and unfreeze criteria.
- Require brainShield review and brainKID or Hani approval before normal operation resumes after any emergency action.

## Required Evidence Before brainShield Review

The following evidence must be attached to the future review packet before brainShield is asked to approve mainnet readiness:

- Public-only authority inventory for every mainnet authority class in this document.
- Multisig/governance custody evidence for upgrade authority, including public address, quorum, signer roles, recovery, and rotation plan.
- Public proof that upgrade authority, fee payer, issuer registry root, trust-class administrator, funds authority, dispute authority, and emergency authority are separated.
- Static diff evidence showing no runtime mainnet program IDs, deploy config, private key paths, secret env names, or signing defaults were introduced by the readiness PR.
- Build proof from the repository's required CI command, or exact blocker if CI cannot run locally.
- Package-health proof for the SATP client package surface.
- Conformance proof that SATP identity, issuer registry, trust-class, and read-only verification can be consumed without AgentFolio.
- Escrow/funds/dispute design proof, including custody choice, public account model, and dispute-resolution policy.
- Emergency/freeze runbook proof with authority scope, trigger policy, rollback/unfreeze criteria, and post-incident evidence requirements.
- Secret-scan proof showing no private keys, seed phrases, token values, raw `.env` contents, or keypair files are present in tracked changes or package artifacts.

## Required Evidence Before brainKID Or Hani Decision

After brainShield review, any brainKID or Hani mainnet decision still requires:

- brainShield sign-off recorded in HQ.
- Complete conformance evidence with command output or CI link.
- Exact deploy plan with commands redacted for secrets and with no implicit default signer assumptions.
- Owner confirmation of signer custody and public authority addresses.
- Explicit go/no-go statement for npm publish, Solana mainnet deploy, keypair changes, production deploy/restart, paid spend, public launch, and client commitments.
- Rollback or containment plan for upgrade, emergency, issuer registry, escrow/funds, and dispute authorities.

## Non-Execution Readback

This readiness document is intentionally non-executing. It changes no runtime program ID, Anchor deploy configuration, keypair, package version, npm metadata, CI secret, RPC endpoint, deploy pipeline, Solana state, or production service.

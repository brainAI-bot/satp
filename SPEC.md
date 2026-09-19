# SATP V3 Specification

**Status:** Current V3 repository specification
**Repo:** `github.com/brainAI-bot/satp`
**Lead:** brainChain
**Consumer review:** brainForge / AgentFolio
**Security review:** brainShield
**Approver:** brainKID
**Last updated:** 2026-09-19

> SATP is the Solana Agent Trust Protocol. It is an app-agnostic protocol and
> SDK surface. AgentFolio consumes SATP; SATP does not depend on AgentFolio.

This document describes the six V3 Anchor interfaces committed in `idls/v3/`
and the package boundary around them. A committed IDL address identifies that
IDL interface; it is not, by itself, proof that the same bytes are deployed on
every cluster. Deployment claims require a separate source/binary/IDL readback.
The escrow claim is currently backed by
`docs/escrow-v3-deployed-truth.json`; the other five program/network pairs remain
evidence-only until equivalent proof exists.

## 1. Scope and dependency direction

SATP owns protocol semantics, V3 program and IDL interfaces, PDA rules, portable
claim schemas, client helpers, conformance fixtures, and protocol security
boundaries.

SATP does not own AgentFolio marketplace UX, profiles or database schema,
routing, moderation, job workflow, analytics, public launch, or other
consumer-specific policy.

```text
AgentFolio and other apps -> @brainai/satp packages -> SATP IDLs/programs
```

SATP packages and examples must not import AgentFolio application modules or
require AgentFolio infrastructure.

## 2. Canonical V3 interface set

The committed source of interface truth is the JSON under `idls/v3/`. Names and
addresses below are copied from those files.

| Program | Committed IDL | IDL address | Instructions |
| --- | --- | --- | --- |
| Identity | `idls/v3/identity_v3.json` | `7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ` | `create_identity`, `burn_to_become`, `update_identity`, `propose_authority`, `accept_authority`, `cancel_authority_transfer`, `link_wallet`, `unlink_wallet`, `update_reputation`, `update_verification`, `update_score_and_level`, `init_mint_tracker`, `record_mint`, `deactivate_identity`, `reactivate_identity`, `register_name`, `release_name`, `migrate_v2_to_v3`, `admin_set_born`, `admin_set_face`, `admin_unbirth`, `admin_close_stale`, `admin_delete_identity`, `admin_set_authority`, `admin_set_score` |
| Attestations | `idls/v3/attestations_v3.json` | `55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw` | `create_attestation`, `create_verified_attestation`, `verify_attestation`, `revoke_attestation`, `create_review_attestation`, `recompute_score` |
| Reputation | `idls/v3/reputation_v3.json` | `CtmZ1fHaypt3R6wbeiGawiRnjzRK9T8jsECk9mET9AK9` | `recompute_reputation` |
| Validation | `idls/v3/validation_v3.json` | `DLB76DzAFY8KNuvnP79BZW3cehGreEQTeGDvFCNd2Ekj` | `recompute_level` |
| Reviews | `idls/v3/reviews_v3.json` | `3yVFrWCpBnQdWNqmiCG9EpoZq7WYeQ421Gx5sUh41Kwk` | `create_review`, `update_review`, `delete_review`, `init_review_counter` |
| Escrow | `idls/v3/escrow_v3.json` | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` | `create_escrow`, `create_usdc_escrow`, `submit_work`, `release`, `release_usdc`, `partial_release`, `partial_release_usdc`, `cancel`, `cancel_usdc`, `raise_dispute`, `resolve_dispute`, `resolve_dispute_usdc`, `extend_deadline`, `close_escrow` |

Consumers must pin the intended cluster and program registry explicitly. They
must not infer a program ID from a local keypair path or treat one committed IDL
address as a blanket mainnet-and-devnet statement.

## 3. Protocol objects

### 3.1 Identity

The Identity program owns `GenesisRecord`, `LinkedWallet`, `MintTracker`, and
`NameRegistry` accounts. It creates and updates identities, links wallets,
transfers authority through propose/accept/cancel steps, records mint limits,
manages names, migrates V2 records, and exposes explicitly named admin repairs.

An identity is protocol data, not an AgentFolio profile. Consumer display fields,
moderation, search, and product status remain outside SATP.

### 3.2 Attestations

An attestation binds an explicit issuer to a subject and claim. The V3 interface
supports creation, verified creation, verification, revocation, review-backed
attestations, and score recomputation. Revocation changes effective status; it
does not erase historical existence. Consumers must apply an explicit issuer
trust policy rather than silently treating unknown issuers as protocol or
security authorities.

### 3.3 Reputation and validation

The Reputation and Validation programs recompute fields on the shared V3
identity record. A score or level is meaningful only with its formula/version,
inputs, and freshness policy. Product tier names are consumer presentation and
do not redefine protocol values.

### 3.4 Reviews

The Reviews program owns `Review` and `ReviewCounter` accounts and supports
create, update, delete, and counter initialization. SATP defines the portable
record interface. Consumers own display, abuse handling, moderation, and any
rule deciding whether a review contributes to reputation.

## 4. Escrow V3

### 4.1 Assets and account states

Escrow V3 supports native SOL and SPL-token escrows, including the repository's
USDC client builders. The on-chain account status values are:

```text
Active
WorkSubmitted
Disputed
Released
Cancelled
Resolved
```

Creation funds an escrow in `Active`. `submit_work` is agent-authorized, must
run no later than the deadline, records a work hash, and moves `Active` to
`WorkSubmitted`.

The client can release all remaining funds from `Active` or `WorkSubmitted`.
Partial release leaves the current status unchanged until the full amount is
released, then marks the account `Released`.

After the deadline, the client can cancel only an `Active` escrow with no
submitted work; unreleased funds return to the client and the state becomes
`Cancelled`. Either client or agent may raise a dispute only from
`WorkSubmitted`, producing `Disputed`. The configured arbiter resolves a dispute
by splitting all remaining funds between client and agent, producing `Resolved`.
Only settled `Released`, `Cancelled`, or `Resolved` accounts can be closed.

### 4.2 Fee routing and stablecoin behavior

The verified deployed SOL `release` and `partial_release` interfaces require the
`escrow`, `client`, `agent`, and writable `treasury` accounts and route the
configured platform fee. The current `release_usdc` and
`partial_release_usdc` interfaces transfer SPL funds from the escrow vault to
the agent account; they do not expose the SOL treasury-account fee-routing
surface. A consumer must therefore choose the builder matching the escrow
currency and current committed IDL rather than assuming SOL and stablecoin
account lists are interchangeable.

`docs/escrow-v3-deployed-truth.json` records a 14-instruction canonical
Program Metadata IDL, byte-for-byte parity with `idls/v3/escrow_v3.json`, and
`conclusion.fee_routing_is_deployed=true`. The older nine-instruction legacy
Anchor IDL account is stale and is not the canonical read path.

### 4.3 Deliberate non-features

Escrow V3 does **not** automatically release funds when work is submitted or a
deadline passes. It does **not** automatically resolve a dispute after a timeout.
Release requires the client-authorized instruction; dispute resolution requires
the arbiter-authorized instruction. Deadlines gate work submission, cancellation,
and client-controlled extension, not automatic settlement.

An on-chain deployed interface does not itself enable AgentFolio consumer
writes. Consumer enablement, caps, product workflow, and any value-bearing
operation remain separate decisions and gates.

## 5. PDA and compatibility rules

PDA seeds, account constraints, instruction arguments, and account order are
defined by the committed V3 IDLs and program source. Client code must validate
all of them against the selected cluster and pinned program IDs.

Breaking public changes require:

1. a specification update;
2. a changelog entry;
3. IDL and conformance updates;
4. consumer compatibility review; and
5. fresh deployment/readback evidence before any live-state claim.

## 6. SDK boundaries

- `@brainai/satp-core` owns app-agnostic schemas and pure helpers.
- `@brainai/satp-solana` owns Solana-specific IDs, IDLs, PDA helpers, decoders,
  transaction builders, and read helpers.
- `@brainai/satp-client` owns higher-level consumer methods and policy helpers.
- `@brainai/satp` is the umbrella package boundary; its publication state is a
  separate release fact.

No SATP package may depend on AgentFolio routes, storage, profile code, or
marketplace policy.

## 7. x402 scope

The repository implements x402 discovery-metadata parsing, runtime-policy
helpers, specifications, and offline/mock examples. It does not operate a paid
SATP lookup, payment gateway, payment verifier, live price, recipient, or
production discovery endpoint. In particular,
`examples/mcp-x402-readonly/src/x402Gate.js` is a mock with live payment disabled.

The endpoint shapes in `docs/x402-reputation-evidence-lookup-api.md` and
`docs/x402-payment-info-contract.md` are provider-facing proposed contracts, not
claims that SATP hosts those routes. Any future paid read is separate work with
an explicit spend/payment authority boundary. Payment for lookup access never
authorizes an agent action, Solana transaction, escrow movement, or production
mutation.

## 8. Evidence and deployment truth

A green local test, generated IDL, committed path, or program ID is not a live
claim. A live claim must bind source, built artifact, deployed ProgramData,
canonical IDL read path, cluster, and observation time. The escrow proof packet
currently supplies that binding for its recorded mainnet observation. Equivalent
proof is still required before making the same claim for each other V3 program.

## 9. Restricted actions

This specification does not authorize Solana writes, deployment, IDL
publication, keypair access or movement, npm publication, AgentFolio production
changes, escrow activation, money movement, branch-protection changes, merge, or
public launch. Those actions require their own task authority and canonical
post-state readback.

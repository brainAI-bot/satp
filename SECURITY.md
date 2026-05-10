# SATP Security Policy

**Status:** Draft v1 for SATP-SEC-001
**Repo:** `github.com/brainAI-bot/satp`
**Owner:** brainChain
**Security reviewer:** brainShield
**Approver:** brainKID
**Last updated:** 2026-05-03

> SATP is the Solana Agent Trust Protocol. This policy defines the minimum security guardrails required before SATP extraction, SDK work, or any future network deployment work.
>
> This document is policy-only. It does not move keys, rotate authorities, deploy programs, publish packages, or change AgentFolio product code.

---

## 1. Security goals

SATP security protects:

```text
Solana program authority
upgrade authority and governance controls
funds and escrow vaults
agent identity integrity
attestation issuer integrity
reputation/validation formula integrity
review and escrow event integrity
SDK consumers and downstream apps
```

SATP must remain app-agnostic. AgentFolio is a consumer, not a privileged owner of SATP protocol authority unless explicitly documented and approved.

---

## 2. Scope

This policy applies to:

```text
SATP programs
SATP IDLs
SATP SDK packages
program ID registries
PDA/account derivation helpers
attestation/reputation/validation/review/escrow schemas
release and deployment scripts
conformance tests
security/key-management docs
```

This policy does not authorize:

```text
mainnet deploys
production keypair movement
production keypair rotation
secret printing
npm publish
AgentFolio product feature changes
public launch actions
```

---

## 3. Secret handling rules

Never commit, print, paste, screenshot, or log:

```text
Solana keypairs
seed phrases
mnemonics
private keys
upgrade authority keys
fee-payer keys
custody/funds authority keys
.env files or token values
RPC tokens
GitHub tokens
HQ tokens
```

Required behavior:

- Use placeholders such as `<REDACTED>` or `<KEYPAIR_PATH_NOT_PRINTED>` when documenting commands.
- Redact command output before sharing if it contains secrets or secret-adjacent paths.
- Prefer public keys over private material for evidence.
- Treat keypair file paths as sensitive when they reveal production layout.
- Do not read production keypair files unless an HQ task explicitly requires it and brainKID/brainShield approval is recorded.

---

## 4. Key and authority classes

SATP separates authorities by purpose:

| Authority class | Purpose | Production handling |
| --- | --- | --- |
| Program deployer | Initial program deployment only | Not reused as runtime authority unless explicitly approved. |
| Upgrade authority | Controls program upgrades | Hardware wallet, multisig, or governed authority preferred before mainnet. |
| Fee payer | Pays transaction fees | Limited balance; never used as upgrade/funds authority. |
| Protocol admin | Manages protocol parameters if any | Minimal permissions and audited instructions only. |
| Attestation issuer | Issues claims about identities/events | Rotatable issuer registry; issuer trust class documented. |
| Reputation/validation signer | Signs formula outputs when off-chain computation is used | Formula version and input refs required. |
| Escrow/funds authority | Controls vault/fund movement if protocol design requires it | Must be separated from upgrade/admin keys; least privilege. |
| Consumer app key | AgentFolio or third-party integration key | Must not be SATP protocol root authority. |

Rules:

- One key must not silently serve multiple authority classes.
- Authority class changes require review evidence and updated docs.
- Mainnet authority changes require explicit HQ approval before execution.

---

## 5. Production keypair exposure policy

Production keypairs must not be exposed in the SATP repo or AgentFolio repo.

Minimum controls before any future mainnet work:

```text
no private key material in git history
no production keypair in repo working tree
no production keypair printed in logs
no production keypair copied into tickets/messages
no production keypair embedded in scripts
no production keypair available to normal test commands
```

If exposure is suspected:

1. Stop the affected workflow.
2. Preserve public evidence without copying secret material.
3. Notify brainKID and brainShield through HQ.
4. Identify affected authority class and blast radius.
5. Rotate or revoke only after explicit approval and a written rotation plan.
6. Record final evidence without secret values.

---

## 6. Rotation rules

Rotation is a controlled security event, not a routine cleanup action.

Allowed rotation triggers:

```text
confirmed secret exposure
suspected compromise
planned migration to multisig/governance
role handoff approved by brainKID
pre-mainnet hardening approved by brainShield
```

Rotation requirements:

- Approval recorded in HQ before production rotation.
- Written target authority class and new public key recorded.
- Dry-run/preflight where technically possible.
- Rollback or recovery plan documented before execution.
- Post-rotation verification of public authority state.
- No private key material in evidence.

Forbidden without explicit approval:

```text
production upgrade-authority rotation
production funds-authority rotation
production issuer root rotation
keypair deletion
keypair movement between machines
mainnet authority transfer
```

---

## 7. Authority and funds controls

SATP design must keep upgrade authority, admin authority, issuer authority, and funds authority separated.

Required controls:

- Escrow vault authority must be derived from protocol state or explicitly governed; it must not depend on a developer hot wallet.
- Fee-payer wallets must hold minimal funds and no protocol authority.
- Upgrade authority must not also be an escrow/funds authority.
- Protocol admin instructions must be minimal, auditable, and documented in IDLs.
- Emergency/pause controls, if added, must define who can pause, who can unpause, and how abuse is prevented.
- Any funds movement instruction must emit inspectable events/accounts sufficient for consumer verification.

---

## 8. Signing boundaries

SATP clients and integrations must make signing responsibilities explicit.

Signing boundary rules:

```text
SATP SDK may build transactions.
SATP SDK must not hide production signing behind implicit side effects.
SATP SDK must not load private keys by default.
SATP SDK must not require AgentFolio server keys for third-party verification.
Consumers sign only consumer-owned actions.
Protocol authorities sign only authority-scoped instructions.
Escrow/funds signatures are separated from identity/attestation signatures.
```

Server-side signing, if ever required, must document:

- signer authority class,
- instruction set permitted,
- environment and secret storage boundary,
- audit logging requirements,
- failure and revocation behavior.

---

## 9. Program and IDL review gates

Before any SATP program/IDL change is considered deployable:

1. SPEC/ARCHITECTURE impact is documented.
2. IDL diff is reviewed for authority, signer, account mutability, and funds movement changes.
3. PDA seeds and bump behavior are reviewed.
4. Error codes and events are documented.
5. Tests cover successful paths and unauthorized signer attempts.
6. brainShield has reviewed security-sensitive changes.
7. brainKID has approved deployment scope through HQ.

IDL changes that modify signer requirements, writable accounts, vault/funds behavior, or authority transfer behavior are security-sensitive by default.

---

## 10. SDK security requirements

SATP SDK packages must:

- expose pure verification helpers that can run without AgentFolio;
- validate network/program ID inputs explicitly;
- fail closed on malformed account data;
- surface issuer, formula version, expiry, and revocation state;
- avoid silently treating unknown issuers as trusted;
- avoid loading local keypairs unless the caller explicitly passes a signer;
- keep browser-safe and Node-only APIs separated.

SATP SDK packages must not:

- embed production secrets;
- infer production signing keys from local paths;
- make hidden network writes from read/verify helpers;
- require AgentFolio database access for protocol verification.

---

## 11. Dependency and release controls

Before npm publication or package release:

```text
build/typecheck passes
unit and conformance tests pass
license and dependency review complete
package contents inspected
no secrets in package tarball
CHANGELOG updated
version bump reviewed
brainKID release approval recorded
```

This SATP-SEC-001 phase does not publish packages.

---

## 12. Incident response

For suspected SATP security incidents:

1. Stop risky writes/deploys.
2. Capture public, non-secret evidence.
3. Notify brainKID and brainShield in HQ.
4. Classify affected module: identity, attestation, reputation, validation, review, escrow, SDK, authority, or package release.
5. Identify affected authority class and possible funds exposure.
6. Propose containment and recovery plan.
7. Execute only approved actions.
8. Publish post-incident notes without secret material.

---

## 13. Required review ownership

Security-sensitive SATP PRs require:

```text
brainChain: protocol owner / implementation evidence
brainShield: security review
brainForge: AgentFolio consumer impact review when adapter behavior changes
brainKID: final approval
```

Security-sensitive includes any change to:

```text
key management
authority model
signer model
funds/escrow movement
program ID registry
IDL signer/writable accounts
reputation/validation trust formula
attestation issuer trust classes
release/deploy scripts
```

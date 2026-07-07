# SATP Key-Management Policy

**Status:** Draft v1 for SATP-SEC-001
**Owner:** brainChain
**Security reviewer:** brainShield
**Last updated:** 2026-05-03

> This policy defines how SATP keys and authorities must be handled before extraction, SDK work, and any future deploy work. It is a policy document only; it does not create, move, rotate, reveal, or delete keys.

---

## 1. Core rule

Production private key material must never enter the SATP repo, AgentFolio repo, HQ messages, reports, logs, screenshots, npm packages, or public PRs.

Only public keys and redacted evidence may be used for review.

---

## 2. Authority inventory template

Every network deployment must maintain an authority inventory with public values only:

| Network | Program/module | Authority class | Public key | Storage class | Rotation status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| devnet | TBD | upgrade authority | `<public key only>` | local/dev only or multisig | active/planned/rotated | no private material |
| mainnet | TBD | upgrade authority | `<public key only>` | sole Owner-held key | active/planned/rotated | no private material; no multisig; no agent co-signer |

Forbidden inventory fields:

```text
private key bytes
seed phrase
secret file contents
raw .env values
RPC token values
GitHub token values
HQ token values
```

---

## 3. Storage classes

Allowed storage classes by risk level:

| Storage class | Allowed use | Notes |
| --- | --- | --- |
| Ephemeral local dev key | Local tests only | Not production, not shared, replaceable. |
| Limited fee-payer key | Dev/test fee payment | Minimal balance; no protocol authority. |
| Hardware wallet | Production authority signing | Preferred for high-value authority. |
| Multisig/governance | Production admin authority, excluding the SATP upgrade authority after the 2026-07-06 Owner decision | Still appropriate for non-upgrade governance or admin roles when approved. |
| Managed secret store | Server signer for limited scoped actions | Requires documented signer boundary and audit logs. |

SATP upgrade authority exception, Owner decision 2026-07-06: the upgrade-authority key remains a sole Owner-held key, with no multisig and no agent co-signer. The prior audit recommendation for upgrade-authority multisig is declined and risk-accepted. Production funds authority should still prefer hardware wallet, multisig/governance, or program-derived custody over hot keys.

---

## 4. Separation of duties

Minimum separation:

```text
upgrade authority != fee payer
upgrade authority != escrow/funds authority
issuer authority != funds authority
consumer app key != SATP root protocol authority
local dev key != production authority
agent signer != upgrade authority
```

Any exception must be time-limited, documented, approved in HQ, and reviewed by brainShield.

---

## 5. Signing policy

Signers must be passed explicitly by the caller or wallet integration.

SATP code must not:

- auto-load production keypairs;
- infer signer paths from environment defaults;
- sign writes inside read/verify helper functions;
- combine fee payment, upgrade authority, and funds movement in one implicit signer;
- print signer secret material or secret-adjacent environment values.

SATP code may:

- export transaction builders;
- export PDA and account helpers;
- accept signer/wallet abstractions explicitly;
- run read-only verification without private keys.

---

## 6. Rotation runbook

Production rotation requires an HQ-approved runbook before execution.

Runbook fields:

```text
reason for rotation
affected network
affected program/module
authority class
current public key
new public key
preflight command plan with secrets redacted
risk and rollback plan
brainShield review evidence
brainKID approval evidence
post-rotation verification plan
```

Execution rules:

1. Do not print private keys.
2. Do not delete old key material until recovery is verified and approval is recorded.
3. Verify authority state using public chain/account data.
4. Record final public-key evidence only.

---

## 7. Exposure response

If production key exposure is suspected:

```text
STOP risky writes
DO NOT paste secret material into chat/HQ/issues
capture public evidence only
notify brainKID + brainShield
identify affected authority class
prepare rotation/containment plan
execute only after approval
```

Severity is high if the exposed key controls:

```text
mainnet upgrade authority
funds/escrow vault authority
issuer root authority
production server signer
package publishing token
```

---

## 8. Pre-mainnet key gate

Before any future SATP mainnet deployment or authority change:

- authority inventory exists with public keys only;
- no production key material exists in repo/package artifacts;
- the SATP upgrade authority is the Owner-approved sole Owner-held public key, with no multisig and no agent co-signer;
- upgrade and funds authorities are separated;
- signer boundaries are documented;
- emergency/pause authority is documented if present;
- brainShield security review is complete;
- brainKID explicit mainnet approval is recorded in HQ.

---

## 9. Evidence rules

Acceptable evidence:

```text
public key values
transaction signatures
program IDs
account addresses
redacted command plans
hashes of reviewed files
screenshots with secrets redacted
CI/test outputs without secrets
```

Unacceptable evidence:

```text
private key bytes
seed phrases
full .env contents
raw token values
unredacted keypair file contents
unredacted secret-store paths when sensitive
```

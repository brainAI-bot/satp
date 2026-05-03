# SATP Security Policy

**Status:** Draft v1 for pre-extraction hardening  
**Owner:** brainChain  
**Security review:** brainShield  
**Final approval:** brainKID

SATP handles identity, attestations, reputation, validation, review, and escrow references. Security mistakes can compromise agent identity and downstream consumer trust.

This policy is documentation only. It does not authorize keypair movement, rotation, deletion, Solana deploys, npm publishing, or production authority actions.

---

## 1. Hard stop rules

Do not commit or print:

```text
seed phrases
private keys
keypair JSON
.env files
OAuth tokens
API keys
RPC tokens
session cookies
production deploy credentials
service-role keys
private client data
raw PII
sensitive prompts
```

If any secret is exposed, stop work and open an incident. Do not continue extraction work until brainShield classifies the exposure and brainKID approves the recovery path.

---

## 2. Key-management principles

SATP must separate these authorities:

```text
program deploy authority
program upgrade authority
issuer governance authority
funds/escrow authority
package publishing authority
GitHub repository administration
runtime service credentials
```

No single hot wallet or developer machine should control all authorities.

Production/mainnet authority must use a named control set:

```text
multisig threshold or equivalent approved custody
hardware-backed signing where possible
access log for signing actions
break-glass owner and recovery process
brainKID approval
brainShield security sign-off
explicit Hani approval for major production/mainnet authority changes
```

The phrase "approved custody process" is not sufficient unless the concrete controls above are documented.

---

## 3. Signing boundaries

Backend or automated signing is allowed only for devnet/test fixtures unless separately approved.

Production should avoid hot upgrade/deployer keys. Any production signing flow must document:

```text
who can initiate signing
where signing happens
what hardware/custody controls protect the key
what logs are retained
how signing is approved
how emergency revoke/freeze works
```

---

## 4. Source-of-truth consistency

Before any release, these must agree:

```text
docs/program-ids.md
Anchor.toml or equivalent program config
packages/satp-solana constants
IDL metadata
published package version
release notes
```

A mismatch blocks release.

---

## 5. Required security checks

Every SATP implementation/extraction PR must include:

```text
changed files list
secret-scan result or confirmation
no-keypair confirmation
no-deploy confirmation
no-npm-publish confirmation
consumer impact summary
rollback path
brainShield review when security-sensitive
```

Before release, run dependency/audit checks appropriate to the stack and record output in the PR.

---

## 6. Threat model baseline

Initial threats:

```text
private key leakage
upgrade authority compromise
malicious or compromised issuer
forged attestations
replay of expired/revoked attestations
program ID or IDL mismatch
metadata privacy leak
consumer relying on stale reputation snapshots
package supply-chain compromise
AgentFolio accidentally owning protocol semantics
```

Controls must be documented in SPEC, SECURITY, SDK docs, and conformance tests before mainnet work.

---

## 7. Incident response

If a SATP security incident occurs:

1. Stop affected deploy/publish/extraction work.
2. Preserve logs without printing secrets.
3. Notify brainKID and brainShield in HQ.
4. Classify severity and affected identities/issuers/packages/programs.
5. Revoke or freeze only through approved authority controls.
6. Publish or withhold public notice based on Hani/brainKID decision.
7. Record postmortem and prevention follow-up.

---

## 8. Issuer compromise and revocation

SATP must define:

```text
who can grant trusted issuer status
who can revoke trusted issuer status
how compromised issuers are marked
how revoked issuers are discovered by consumers
how attestations from compromised issuers are treated
how trust-class changes are versioned
```

Consumers must be able to reject revoked/expired attestations and compromised issuers.

---

## 9. Privacy requirements

SATP metadata must not contain raw PII, OAuth tokens, API keys, private client data, sensitive prompts, seed phrases, private keys, or unredacted logs.

Prefer:

```text
metadata_hash
metadata_uri
redacted evidence
content-addressed references
issuer-signed claims
```

If data is sensitive, store only the minimum verifiable reference needed for trust and auditability.

---

## 10. Pre-mainnet gate

Before mainnet work:

```text
SECURITY.md accepted
SPEC.md accepted
key-management docs accepted
program IDs documented
issuer governance documented
secret scanning configured
threat model reviewed
emergency upgrade/freeze runbook reviewed
brainShield signs off
brainKID approves
Hani approves major production/mainnet authority actions
```

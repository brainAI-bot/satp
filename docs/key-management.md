# SATP Key Management

**Status:** Draft v1  
**Security review:** brainShield  
**Final approval:** brainKID

This document defines key-management expectations for SATP before extraction, deployment, package publishing, or mainnet work.

---

## 1. Authority inventory

Track each authority separately:

| Authority | Purpose | Production control requirement |
| --- | --- | --- |
| Deploy authority | Initial program deployment | Explicit approval before use |
| Upgrade authority | Program upgrade/freeze | Multisig or approved custody with hardware-backed signing where possible |
| Issuer governance authority | Trusted issuer grant/revoke | Logged approval and revocation process |
| Funds/escrow authority | Escrow/funds movement | Separate from deploy/upgrade authority |
| Package publishing authority | npm/package release | Least privilege and 2FA |
| GitHub admin | Repo/settings/secrets | Owner/admin approval path |

---

## 2. Mainnet authority control set

Mainnet upgrade/deploy authority requires all of:

```text
named owner(s)
multisig threshold or approved custody control
hardware-backed signing where possible
access log for every signing event
break-glass owner and recovery procedure
brainKID approval
brainShield sign-off
Hani approval for major production/mainnet authority changes
```

No generic "approved custody process" is valid unless it names the exact controls.

---

## 3. Development signing

Devnet/test signing may use controlled local or backend signing only for test fixtures.

Production must avoid hot upgrade/deployer keys. If an exception is proposed, it requires a written decision packet covering:

```text
reason
risk
scope
duration
key location
access list
logs
rollback/revocation
brainShield review
brainKID/Hani approval where applicable
```

---

## 4. Rotation and revocation

Rotation triggers:

```text
suspected exposure
employee/agent access change
custody process change
pre-mainnet hardening
incident response
scheduled security review
```

Rotation steps:

1. Stop related deploy/publish work.
2. Classify affected authority.
3. Preserve logs without printing secrets.
4. Rotate using approved custody path.
5. Update source-of-truth docs and config references.
6. Verify old authority cannot act.
7. Record evidence in HQ.

---

## 5. Source-of-truth files

These must remain consistent:

```text
docs/program-ids.md
Anchor.toml or equivalent config
packages/satp-solana constants
IDL metadata
release notes
```

Any mismatch blocks release.

---

## 6. Secret handling

Never store secrets in:

```text
GitHub commits
HQ messages
screenshots
logs
issue/PR descriptions
agent memory
public docs
frontend/client builds
```

Use redacted evidence and hash references. If a secret appears, treat it as compromised until brainShield says otherwise.

---

## 7. Pre-release checklist

Before release or mainnet work:

```text
[ ] No private keys or seed phrases in repo history
[ ] No service-role/RPC/API tokens in repo history
[ ] Program IDs and IDLs match docs/config/constants
[ ] Upgrade authority control set documented
[ ] Emergency freeze/upgrade runbook documented
[ ] Issuer governance documented
[ ] Revocation process documented
[ ] brainShield security review passed
[ ] brainKID final approval recorded
[ ] Hani approval recorded for major production/mainnet authority actions
```

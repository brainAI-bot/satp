# SATP Operational Signer Separation

**Status:** Engineering prep only for low-privilege signer separation.

This document defines the safe configuration boundary between a low-privilege
SATP operational signer and the Owner-held SATP upgrade authority. It does not
provision keys, read keypairs, transfer authority, deploy programs, publish npm
packages, or write Solana state.

## Roles

| Role | Purpose | Allowed material in repo/HQ/PRs | Must not control |
| --- | --- | --- | --- |
| Operational signer | Limited devnet/offline operations such as fee payment, transaction submission after separate approval, transaction preparation, and read-only RPC. | Public key only. | Upgrade authority, key management, funds custody, deploys, npm publish. |
| Owner upgrade authority | SATP program upgrade authority held by the Owner. | Public key only after Owner approval. | Agent runtime use, operational automation, hot-key fallback. |

The same public key must never be configured as both the operational signer and
the Owner upgrade authority.

## Public Config Shape

Use public-key-only configuration names. These names are safe to document, but
their values must still be public keys only. The checked-in public config for
the current Owner-provisioned operational signer is
`config/satp-operational-signer.public.json`.

```text
SATP_OPERATIONAL_SIGNER_PUBLIC_KEY=8N3WfudPvGtJT775SSt5qxE24vFEAaCHzepMyfnNSA2g
SATP_OWNER_UPGRADE_AUTHORITY_PUBLIC_KEY=Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc
```

Do not introduce config fields for keypair paths, seed phrases, private keys,
raw environment dumps, secret-store paths, deploy credentials, npm tokens, RPC
tokens, or Owner signing instructions.

SDK callers can normalize a public policy packet without touching secrets:

```javascript
const {
  buildSignerSeparationConfig,
  validateSignerSeparationConfig,
} = require('@brainai/satp-client');

const config = buildSignerSeparationConfig({
  network: 'devnet',
  operationalSignerPublicKey: '8N3WfudPvGtJT775SSt5qxE24vFEAaCHzepMyfnNSA2g',
  ownerUpgradeAuthorityPublicKey: 'Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc',
  operationalAllowedActions: [
    'devnet_transaction_submission',
    'read_only_rpc',
    'offline_transaction_preparation',
    'devnet_fee_payment',
  ],
});

if (!validateSignerSeparationConfig(config).ok) {
  throw new Error('Invalid SATP signer separation config');
}
```

The helper accepts public keys and action names only. It rejects secret-like
fields, shared operational/Owner public keys, and actions outside the low
privilege allowlist.

## Operational Allowlist

The operational signer
`8N3WfudPvGtJT775SSt5qxE24vFEAaCHzepMyfnNSA2g` may be configured only for
low-privilege fee-payer, test, and attestation-signing workflows that are
separately approved through HQ. Its policy allowlist is:

```text
read_only_rpc
offline_transaction_preparation
devnet_fee_payment
devnet_transaction_submission
```

Any live write or transaction submission still requires a separate HQ assignment
and must follow the active deploy/key-management gate.

## Owner-Provisioned Public Key

Owner has provisioned this public key for the low-privilege operational signer:

```text
8N3WfudPvGtJT775SSt5qxE24vFEAaCHzepMyfnNSA2g
```

This public key is limited to fee-payer, test, and attestation signing scope
only. It is not upgrade authority, is not authorized to rewrite programs, and
must not be used for authority transfer, key generation or rotation, deploys,
npm publishing, funds custody, funds transfer, or any mainnet action.

Read-only mainnet account lookup on 2026-07-08 showed both
`8N3WfudPvGtJT775SSt5qxE24vFEAaCHzepMyfnNSA2g` and
`Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc` as non-executable
system-owned public accounts. The configured operational signer public key is
distinct from the cited hot upgrade key
`Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc`.

Do not add keypair files, private keys, seed phrases, secret-store references,
authority-transfer instructions, deploy commands, npm tokens, or funding
instructions for this signer.

## Owner-Gated Actions

The operational signer must not be used for:

```text
program_upgrade
authority_transfer
key_generation
key_rotation
mainnet_deploy
devnet_deploy
npm_publish
funds_custody
funds_transfer
```

Those actions require a separate Owner-approved runbook and are outside this
engineering prep slice.

## Evidence Boundary

Acceptable evidence for this separation work:

```text
public keys
exported policy object shape
offline test output
redacted config names
file hashes
PR link
```

Unacceptable evidence:

```text
private key bytes
seed phrases
keypair file contents
unredacted .env contents
secret-store paths when sensitive
deploy commands that perform writes
authority-transfer commands
```

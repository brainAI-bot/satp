# SATP client quickstart

This quickstart is for consumers that need a reviewable SATP SDK install and a
first offline verification flow. It does not publish packages, deploy Solana
programs, write to devnet or mainnet, read or move keypairs, authorize live x402
payments, change AgentFolio product code, or approve production launch claims.

## Choose an install path

Use the stable npm package unless the review task explicitly asks for a release
candidate or a commit-addressed Git review pin.

| Use case | Install |
| --- | --- |
| Stable app consumption | `npm install @brainai/satp-client@2.0.3` |
| HQ-assigned historical rc reproduction | `npm install @brainai/satp-client@2.0.2` |
| HQ-assigned moving rc-tag validation | `npm install @brainai/satp-client@rc` |
| HQ-assigned source review | `npm install git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>` |

The current npm `rc` tag resolves to historical package `2.0.2`, which is older
than stable `latest` `2.0.3`. Use the exact `2.0.2` version when the review
artifact must be reproducible; use `@rc` only when the HQ task names the moving
tag as the target.

Do not use `@brainai/satp` as the public install target yet. It remains a
private workspace umbrella package until a separate release gate publishes it
and updates install-ready docs.

## Build and validate a read-only trust packet

```js
const {
  buildSatpTrustPacket,
  validateSatpTrustPacket,
} = require('@brainai/satp-client');

const packet = buildSatpTrustPacket({
  subjectWallet: '11111111111111111111111111111111',
  agentId: 'brainChain',
  claimType: 'identity',
  metadataHash: '93d122f8879fe87c186c10a00db8fbc80a73cecd2ede44b9ffa6410be3c2b805',
  network: 'devnet',
});

const validation = validateSatpTrustPacket(packet);
if (!validation.ok) throw new Error(validation.errors.join('; '));

console.log(packet.schemaVersion);
console.log(packet.mode);
console.log(packet.flags);
```

Expected read-only properties:

- `mode` is `offline-readonly-trust-packet`.
- `flags.signingRequired`, `flags.transactionRequired`,
  `flags.writesRequired`, and `flags.livePaymentRequired` are `false`.
- `instructions` and `signers` are empty.
- `transaction` is `null`.

## Run offline review checks

From this repository, the focused conformance gate is:

```bash
npm run test:conformance:rc-s6
```

The full offline repository gate is:

```bash
npm run ci
```

Both commands are intended to be offline/review checks. They are not deploy,
publish, signing, or key-management commands.

## Network boundary

Use `network: 'devnet'` for default examples and fixture review. The SDK also
contains reviewed V3 mainnet program IDs documented by the mainnet authority
decision packet, but that registry is not approval to mutate mainnet state.

Before any mainnet write, deploy, authority action, fee-payer use, escrow or
funds action, npm promotion, production restart, public launch claim, or
business commitment, require a separate HQ task and the owner-gated runbook
named by that task.

## Related docs

- [`docs/satp-client-consumer-install.md`](./satp-client-consumer-install.md)
  covers dependency policy and consumer install proofs.
- [`docs/conformance.md`](./conformance.md) covers RC-S6 fixtures and semantic
  uncertainty gates.
- [`docs/package-naming-decision.md`](./package-naming-decision.md) explains
  why `@brainai/satp-client` is the current public consumer package and
  `@brainai/satp` remains gated.
- [`docs/mainnet-authority-decision-packet-6c8a5545.md`](./mainnet-authority-decision-packet-6c8a5545.md)
  records public mainnet authority evidence without authorizing new writes.

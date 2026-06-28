# AgentFolio SATP consumption readiness

Status: readiness packet for AgentFolio consumers. This document records the SATP package boundary and install rules only; it does not change AgentFolio product code, publish npm packages, deploy Solana programs, read or move keypairs, or perform devnet/mainnet writes.

## Consumption rule

AgentFolio consumes SATP from the stable npm package by default. A reviewed SATP Git commit pin is allowed only when HQ assigns explicit branch/PR coordination work, and the consumer PR must record the exact SATP commit SHA and the reason for the temporary Git pin.

Mergeable AgentFolio changes must not use SATP branch refs, local tarballs, sibling checkout paths, or unpublished workspace packages as the durable dependency.

## Source-linked package boundary

| Source | Current boundary |
| --- | --- |
| [`package.json`](../package.json) | Repo root is named `@brainai/satp-client`, remains `private: true`, and exposes the Git-installable review surface through `packages/satp-client/src/index.js`, `packages/satp-client/src/index.d.ts`, `./wallet-control-challenge`, `./x402-discovery`, `./src/*`, and `./package.json`. |
| [`packages/satp-client/package.json`](../packages/satp-client/package.json) | Publishable client package is named `@brainai/satp-client`, currently `2.0.2-rc.0` in source, with `main=src/index.js`, `types=src/index.d.ts`, public package files under `src/`, `examples/`, and `README.md`, and `publishConfig.tag=rc`. |
| [`scripts/check-exports.js`](../scripts/check-exports.js) | Offline export smoke requires the AgentFolio-facing public surface, including `SATPSDK`, `SATPV3SDK`, `createSATPClient`, `getV3ProgramIds`, `hashAgentId`, `getGenesisPDA`, `prepareIdentityAttestationRequest`, trust-packet helpers, runtime-policy helpers, wallet-control helpers, and x402 discovery helpers. |
| [`examples/agentfolio-consumer-readonly`](../examples/agentfolio-consumer-readonly) | AgentFolio stays a read-only consumer of SATP helpers. The example builds unsigned trust packets from app-owned profile data and does not sign, send transactions, call RPC, publish packages, deploy programs, or mutate AgentFolio production data. |

Live npm metadata was verified with `npm view @brainai/satp-client name version dist-tags --json` on 2026-06-28: package `@brainai/satp-client`, `latest` version `2.0.1`, and `rc` dist-tag `0.1.0-rc.0`.

## Allowed AgentFolio install forms

Default stable npm dependency:

```json
{
  "dependencies": {
    "@brainai/satp-client": "2.0.1"
  }
}
```

Default npm tag form for consumers that intentionally track npm latest:

```bash
npm install @brainai/satp-client
```

Temporary HQ-assigned branch/PR coordination dependency:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<REVIEWED_SATP_COMMIT_SHA>"
  }
}
```

The Git form is review-only. The AgentFolio PR that uses it must name the HQ task, include the exact SATP commit SHA, explain why stable npm is insufficient for that coordination task, and replace the Git pin with stable npm once the reviewed SATP artifact is published for normal consumption.

## Disallowed AgentFolio install forms

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#some-branch",
    "@brainai/satp-client-local": "file:../satp/packages/satp-client",
    "@brainai/satp": "0.0.0-extraction",
    "@brainai/satp-core": "0.0.0-extraction",
    "@brainai/satp-solana": "0.0.0-extraction"
  }
}
```

Branch refs are mutable, local paths are not reviewable from a clean checkout, and the umbrella/core/solana workspaces remain private review surfaces until a separate HQ release task authorizes publish/install documentation.

## Readiness checks

Run these SATP-side checks before asking AgentFolio to consume a reviewed SATP branch or commit:

```bash
npm run check:exports
npm run test:package-entrypoints
npm run smoke:consumer-install
npm --prefix examples/agentfolio-consumer-readonly run check
npm --prefix examples/agentfolio-consumer-readonly test
```

These checks are offline/read-only. They must not publish to npm, deploy programs, perform Solana writes, read or mutate keypairs, restart production, or expose credentials.

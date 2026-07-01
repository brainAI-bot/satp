# SATP package boundary and consumer hardening

Status: SATP S4 package-boundary hardening for branch/PR review. This document is policy and consumer guidance only; it does not publish npm packages, deploy programs, write to devnet/mainnet, move/read keypairs, or change AgentFolio product code.

## Current package audit

| Area | Current state | Hardening decision |
| --- | --- | --- |
| Git-installable root package | `package.json` is named `@brainai/satp-client`, `private: true`, and points `main`, `types`, and `exports["."]` at `packages/satp-client/src/index.js` and `packages/satp-client/src/index.d.ts`. | Keep this root shape only for branch/PR review consumers because clean Git install resolves `@brainai/satp-client` without a sibling tarball or review-branch publish. |
| Workspaces | Root workspaces include `packages/satp-client`, `packages/satp-core`, `packages/satp-solana`, and `packages/satp`. | Keep workspace split as the target boundary; `packages/satp`, `packages/satp-core`, and `packages/satp-solana` expose PR-review entrypoints over the existing SDK implementation. |
| Client package | `packages/satp-client/package.json` is named `@brainai/satp-client`, versioned as the reviewed RC-S6 artifact `2.0.2-rc.0`, with `main=src/index.js` and `types=src/index.d.ts`. The current stable consumer package remains npm `@brainai/satp-client@2.0.1`; historical rc-tag readback may still show `0.1.0-rc.0` until the rc channel is promoted. | Treat the client package as the SDK source surface while consumer docs keep stable installs on npm `2.0.1` and exact rc validation on `2.0.2-rc.0` after promotion. |
| Umbrella package target | `packages/satp/package.json` is named `@brainai/satp`, private, version `0.0.0-extraction`, and exports `index.js`/`index.d.ts` for PR review. | Keep it private; do not expose it as install-ready until release review authorizes publish/install docs. |
| Core/Solana packages | `@brainai/satp-core` and `@brainai/satp-solana` are private package entrypoints with explicit exports. | Keep them private; do not tell consumers to install them yet. |
| Runtime dependencies | Root/client depend on `@solana/web3.js`, `borsh`, and `bs58`. | Keep dependencies explicit at the installable boundary; no undeclared `@brainai/satp-v3` dependency is allowed. |
| Export surface | Root `require('@brainai/satp-client')` resolves to the extracted client entrypoint. Existing review-phase subpaths under `@brainai/satp-client/src/*` remain exported. | Required exports are smoke-tested by `npm run check:exports`: `SATPSDK`, `SATPV3SDK`, `createSATPClient`, `getV3ProgramIds`, `hashAgentId`, `getGenesisPDA`, and `prepareIdentityAttestationRequest`. |

## Package naming and version proposal

- Package naming decision: SATP uses a phased umbrella/client split. The stable
  consumer install target today remains npm `@brainai/satp-client@2.0.1`; the
  long-term umbrella target is `@brainai/satp` only after a separate public
  release gate approves the package and install-ready docs. See
  [`docs/package-naming-decision.md`](./package-naming-decision.md).
- Stable consumer package: use npm `@brainai/satp-client@2.0.1` unless a task explicitly requires branch-only review.
- Reviewed RC-S6 package artifact: `@brainai/satp-client@2.0.2-rc.0`. Do not describe the older `0.1.0-rc.0` rc-tag readback as the current release-gate artifact.
- Branch/PR phase: Git-install the SATP repo from a reviewed commit only for active development or review; extraction-branch labels such as `0.0.0-extraction` are not the current consumer package.
- Pre-release SDK phase: use explicit rc/alpha versions only after CI is green, consumer docs are current, and brainKID/brainForge approve the boundary.
- Future umbrella target: `@brainai/satp`, `@brainai/satp-core`, and `@brainai/satp-solana` now have PR-review entrypoints and package-boundary tests, but remain private until release review authorizes publish/install docs. Do not replace the stable `@brainai/satp-client` consumer path with `@brainai/satp` until that release review lands.
- Version guidance here must not imply mainnet readiness unless the mainnet authority/deploy process is separately approved in HQ.

## Consumer install path

Stable consumers should install the current npm package:

```json
{
  "dependencies": {
    "@brainai/satp-client": "2.0.1"
  }
}
```

For active SATP branch/PR review, use a commit-addressed Git dependency:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<REVIEWED_SATP_COMMIT>"
  }
}
```

Rules:

- AgentFolio defaults to stable npm; reviewed SATP Git commit pins are allowed
  only for HQ-assigned AgentFolio/SATP branch or PR coordination, with the
  exact SATP commit SHA and reason recorded in the consumer PR.
- Pin a commit hash for mergeable consumer PRs; branch refs are only for temporary review.
- Do not use sibling paths such as `file:../satp/...` in mergeable AgentFolio changes.
- Do not publish to npm from this hardening phase.
- Do not require consumer apps to copy SATP IDLs, PDA seeds, or private protocol logic.

See [`docs/agentfolio-consumption-readiness.md`](./agentfolio-consumption-readiness.md)
for the AgentFolio-specific readiness packet and allowed install forms.

## CI/build/test standard

Run this offline gate before requesting review:

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run ci
```

`npm run ci` performs:

1. `npm run lint:roadmap` - validates roadmap references.
2. `npm run validate:idls` - validates all committed IDL JSON files.
3. `npm run check:js` - syntax-checks extracted client JS sources.
4. `npm run check:exports` - verifies the Git-installable root export surface.
5. `npm run check:release-metadata` - verifies the local rc metadata is newer than stable latest and matches the release fixture.
6. `npm run test:package-entrypoints` - verifies workspace imports and execution for `@brainai/satp`, `@brainai/satp-core`, and `@brainai/satp-solana`.
7. `npm run smoke:consumer-install` - installs the package into a clean temporary consumer and verifies `require('@brainai/satp-client')` from `node_modules`.
8. `npm run test:conformance:rc-s6` - runs the offline RC-S6 conformance fixtures.
9. The remaining offline SDK, runtime-policy, wallet-control, x402 discovery, V3, and Borsh tests.

GitHub Actions now runs the dedicated SATP release gate on relevant SATP
source/package changes. The gate executes `npm run ci`,
`npm run check:satp-client-health`, `npm run test:conformance:rc-s6`, and
`npm run pack:satp-client`. Package health includes production audit,
package metadata readback, dry-run pack-surface checks, require/import smoke,
and packed-file secret-shape scans.

This CI standard intentionally excludes deploy, publish, mainnet/devnet write, keypair, and production actions.

Run the expanded offline example conformance gate before changing consumer-facing runtime examples:

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run ci:offline-with-examples
```

`npm run ci:offline-with-examples` performs the root `npm run ci` checks, then runs `npm run check:examples` and `npm run test:examples` for the read-only runtime examples:

1. `examples/mcp-x402-readonly` - MCP/x402 SATP read-only runtime example.
2. `examples/agentfolio-consumer-readonly` - AgentFolio consumer read-only SATP record example.
3. `examples/third-party-runtime-conformance` - app-agnostic runtime example that verifies SATP identity, attestation, and trust packet fixtures without AgentFolio infrastructure.

The example conformance gate is fixture-first and offline. It must not publish packages, deploy programs, read or change keypairs, write to Solana devnet/mainnet, mutate production, perform client work, or change AgentFolio product code.

## Security and key-management guardrails

- No npm publish in this phase.
- No Solana devnet/mainnet writes or deploys.
- No keypair reads, movement, rotation, deletion, or path disclosure.
- No `.env`, RPC token, GitHub token, HQ token, private key, or seed material may be printed or committed.
- SDK methods may build unsigned transactions, but CI must not sign or send transactions.
- AgentFolio remains a consumer/adapter. It must not become SATP source-of-truth, edit SATP IDLs, or own protocol deployment authority.

## Review checklist

- [ ] Root and client package names/versions are intentional for the current phase.
- [ ] Install docs use commit-addressed Git dependencies and no local tarball/sibling path for mergeable PRs.
- [ ] `npm run ci` passes from a clean checkout.
- [ ] `npm run ci:offline-with-examples` passes when consumer-facing runtime examples change.
- [ ] `npm run smoke:consumer-install` passes from a clean temporary consumer.
- [ ] Required exports remain available from the Git-installed root package.
- [ ] Security docs still forbid deploys, keypair movement, secret printing, and npm publish without explicit HQ approval.

# SATP package boundary and consumer hardening

Status: SATP S4 package-boundary hardening for branch/PR review. This document is policy and consumer guidance only; it does not publish npm packages, deploy programs, write to devnet/mainnet, move/read keypairs, or change AgentFolio product code.

## Current package audit

| Area | Current state | Hardening decision |
| --- | --- | --- |
| Git-installable root package | `package.json` is named `@brainai/satp-client`, `private: true`, version `0.0.0-extraction`, `main=packages/satp-client/src/index.js`, `types=packages/satp-client/src/index.d.ts`. | Keep this root shape for branch/PR consumers because clean Git install resolves `@brainai/satp-client` without a sibling tarball or npm publish. |
| Workspaces | Root workspaces include `packages/satp-client`, `packages/satp-core`, `packages/satp-solana`, and `packages/satp`. | Keep workspace split as the target boundary; only `packages/satp-client` has runnable JS in this extraction branch. |
| Client package | `packages/satp-client/package.json` is named `@brainai/satp-client`, private, version `0.0.0-extraction`, `main=src/index.js`, `types=src/index.d.ts`. | Treat as the current public SDK surface for AgentFolio and external consumers. |
| Umbrella package target | `packages/satp/package.json` is named `@brainai/satp`, private, version `0.0.0-extraction`, `main=README.md`. | Reserve `@brainai/satp` as the future stable umbrella package; do not expose it as install-ready until it has code entrypoints and tests. |
| Core/Solana packages | `@brainai/satp-core` and `@brainai/satp-solana` are private README placeholders. | Keep placeholders private; do not tell consumers to install them yet. |
| Runtime dependencies | Root/client depend on `@solana/web3.js`, `borsh`, and `bs58`. | Keep dependencies explicit at the installable boundary; no undeclared `@brainai/satp-v3` dependency is allowed. |
| Export surface | Root `require('@brainai/satp-client')` resolves to the extracted client entrypoint. | Required exports are smoke-tested by `npm run check:exports`: `SATPSDK`, `SATPV3SDK`, `createSATPClient`, `getV3ProgramIds`, `hashAgentId`, and `getGenesisPDA`. |

## Package naming and version proposal

- Branch/PR phase: keep `@brainai/satp-client@0.0.0-extraction` private and Git-installable from a reviewed commit.
- Pre-release SDK phase: use `@brainai/satp-client@0.1.0-alpha.0` only after CI is green, consumer docs are current, and brainKID/brainForge approve the boundary.
- Stable package target: expose `@brainai/satp` as the umbrella package only after `packages/satp` has real JS/TS entrypoints, conformance tests, and security review.
- `1.0.0` is reserved for a security-reviewed public SDK/conformance release. It must not imply mainnet readiness unless the mainnet authority/deploy process is separately approved in HQ.

## Consumer install path

AgentFolio and external consumers should use a commit-addressed Git dependency while npm publish is blocked:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<REVIEWED_SATP_COMMIT>"
  }
}
```

Rules:

- Pin a commit hash for mergeable consumer PRs; branch refs are only for temporary review.
- Do not use sibling paths such as `file:../satp/...` in mergeable AgentFolio changes.
- Do not publish to npm from this hardening phase.
- Do not require consumer apps to copy SATP IDLs, PDA seeds, or private protocol logic.

## CI/build/test standard

Run this offline gate before requesting review:

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run ci
```

`npm run ci` performs:

1. `npm run validate:idls` — validates all committed IDL JSON files.
2. `npm run check:js` — syntax-checks extracted client JS sources.
3. `npm run check:exports` — verifies the Git-installable root export surface.
4. `npm run test:v3` — runs offline SATP V3 PDA/SDK tests.
5. `npm run test:borsh` — runs offline Borsh reader tests.

This CI standard intentionally excludes deploy, publish, mainnet/devnet write, keypair, and production actions.

Run the expanded offline example conformance gate before changing consumer-facing runtime examples:

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run ci:offline-with-examples
```

`npm run ci:offline-with-examples` performs the root `npm run ci` checks, then runs `npm run check:examples` and `npm run test:examples` for both read-only runtime examples:

1. `examples/mcp-x402-readonly` - MCP/x402 SATP read-only runtime example.
2. `examples/agentfolio-consumer-readonly` - AgentFolio consumer read-only SATP record example.

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
- [ ] Required exports remain available from the Git-installed root package.
- [ ] Security docs still forbid deploys, keypair movement, secret printing, and npm publish without explicit HQ approval.

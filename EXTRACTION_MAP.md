# SATP Extraction Map

**Status:** Draft v1  
**Owner:** brainChain  
**AgentFolio consumer review:** brainForge  
**Security review:** brainShield  
**Final approval:** brainKID

This map stages SATP extraction from AgentFolio into `brainAI-bot/satp` without deploys, keypair changes, package publishing, Masthead work, client work, or public launch.

---

## 1. Guardrails

Allowed in this phase:

```text
documentation
source mapping
adapter boundary definitions
staged PRs
unit/conformance test scaffolding
reviewable file moves only after approval
```

Not allowed in this phase:

```text
Solana devnet deploys
Solana mainnet deploys
production keypair changes or movement
seed phrase/private key handling
npm publish
AgentFolio product feature work
Masthead work
client work
public launch
```

---

## 2. Current known AgentFolio SATP areas

AgentFolio currently contains SATP/protocol-like material in or near these categories:

```text
satp-client/
satp-idls/
programs/satp/
tests/satp/
identity-v3 routes/services
satp API routes
satp write routes
satp explorer routes
reputation-v3 logic
reviews-v3 protocol references
chain/cache helpers
score formula helpers
program ID constants
IDL references
PDA helper logic
```

The exact 73-source-path inventory is preserved in section 5 and must be reviewed by brainForge before any move.

---

## 3. Target SATP repo structure

Target shape:

```text
satp/
├── ARCHITECTURE.md
├── SPEC.md
├── SECURITY.md
├── EXTRACTION_MAP.md
├── docs/
│   ├── key-management.md
│   ├── program-ids.md
│   ├── issuer-governance.md
│   └── privacy.md
├── idls/
├── packages/
│   ├── satp-core/
│   ├── satp-solana/
│   ├── satp-sdk/
│   └── satp-conformance/
├── programs/
│   └── satp/
├── tests/
│   ├── conformance/
│   └── fixtures/
└── scripts/
    └── verify-source-of-truth.js
```

---

## 4. Target AgentFolio shape after extraction

AgentFolio should keep only consumer-side references and integration code:

```text
src/adapters/satp/
src/routes/satp.js          # consumer-facing API wrapper, if retained
src/services/satpSyncService.js
src/repositories/satpReferenceRepository.js
frontend SATP display/use flows
tests/integration/satp-consumer.test.js
```

AgentFolio should not keep protocol source-of-truth files long-term:

```text
SATP IDL source files
SATP PDA seed definitions
SATP account layout definitions
SATP score formula internals
SATP program source as canonical source
mainnet authority config
program keypairs
```

---

## 5. Exact 73-source-path AgentFolio extraction inventory

This inventory restores the exact 73 AgentFolio source paths from the local SATP-SPEC-001 artifact. It is an extraction plan only; it does not move files, deploy programs, publish packages, or change keypairs.

| AgentFolio source path | Target SATP location / disposition | AgentFolio remaining consumer path | Owner | Notes |
| --- | --- | --- | --- | --- |
| `docs/specs/satp-mcp-README.md` | `docs/integration-guide.md or docs/mcp.md` | AgentFolio docs keep links/migration notes only | brainChain; brainForge reviews consumer-facing links | Move protocol portions into SATP `docs/`; AgentFolio keeps integration guide links only. |
| `satp-client/README.md` | `packages/satp-client/README.md or docs/migration.md` | AgentFolio docs keep links/migration notes only | brainChain; brainForge reviews consumer-facing links | Move into `docs/` or package README under `packages/satp-client/`; de-duplicate during extraction. |
| `satp-client/idl/satp_escrow.json` | `idls/satp_escrow.json` | temporary AgentFolio copy until SATP dependency cutover; then non-canonical cache only if needed | brainChain; brainShield reviews key/program boundaries when relevant | Move canonical SATP IDLs into `idls/`; keep AgentFolio consumer copy only until dependency cutover. |
| `satp-client/package-lock.json` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/package.json` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/constants.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/index.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/pda.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/schema.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/v3-pda.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/v3-sdk.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/test.js` | `tests/sdk/ or examples/` | AgentFolio keeps consumer integration coverage only | brainChain for SATP tests/examples; brainForge for AgentFolio tests | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `scripts/backfill-satp-scores.js` | `scripts/verify/ if protocol-owned; otherwise stays AgentFolio` | same AgentFolio script if DB/backfill/product-specific; otherwise remove after SATP verify script exists | brainChain + brainForge case-by-case | Review case-by-case; protocol validation scripts move to SATP `scripts/verify/`, AgentFolio DB backfills remain AgentFolio. |
| `scripts/migrate-satp-scores.js` | `scripts/verify/ if protocol-owned; otherwise stays AgentFolio` | same AgentFolio script if DB/backfill/product-specific; otherwise remove after SATP verify script exists | brainChain + brainForge case-by-case | Review case-by-case; protocol validation scripts move to SATP `scripts/verify/`, AgentFolio DB backfills remain AgentFolio. |
| `scripts/one-off/fix-satp-account.js` | `scripts/verify/ if protocol-owned; otherwise stays AgentFolio` | same AgentFolio script if DB/backfill/product-specific; otherwise remove after SATP verify script exists | brainChain + brainForge case-by-case | Review case-by-case; protocol validation scripts move to SATP `scripts/verify/`, AgentFolio DB backfills remain AgentFolio. |
| `scripts/tests/test-satp.js` | `scripts/verify/ if protocol-owned; otherwise stays AgentFolio` | same AgentFolio script if DB/backfill/product-specific; otherwise remove after SATP verify script exists | brainChain + brainForge case-by-case | Review case-by-case; protocol validation scripts move to SATP `scripts/verify/`, AgentFolio DB backfills remain AgentFolio. |
| `src/boa_nft_idl.json` | `docs/agentfolio-adapter.md or examples/agentfolio-adapter/ (not core IDL unless SATP-owned)` | temporary AgentFolio copy until SATP dependency cutover; then non-canonical cache only if needed | brainChain; brainShield reviews key/program boundaries when relevant | Move canonical SATP IDLs into `idls/`; keep AgentFolio consumer copy only until dependency cutover. |
| `src/lib/satp-boa-linker.js` | `TBD` | TBD: do not move until classified; keep AgentFolio path unchanged meanwhile | brainChain + brainForge classification required | Classify during extraction PR before moving. |
| `src/lib/satp-explorer.js` | `stays in AgentFolio as consumer adapter` | `src/lib/satp-explorer.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as consumer-only code; replace embedded protocol logic with SATP package imports. |
| `src/lib/satp-face-registry.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract app-agnostic verification/registry helpers; keep AgentFolio-specific provider wiring outside SATP. |
| `src/lib/satp-onchain-verify.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract app-agnostic verification/registry helpers; keep AgentFolio-specific provider wiring outside SATP. |
| `src/lib/satp-registry.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract app-agnostic verification/registry helpers; keep AgentFolio-specific provider wiring outside SATP. |
| `src/lib/satp-reviews-client.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/lib/satp-reviews-onchain.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/lib/satp-reviews.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/lib/satp-v3-client.ts` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract protocol-owned client logic into SATP packages; leave AgentFolio route-facing adapter only. |
| `src/lib/satp-verification-bridge.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract app-agnostic verification/registry helpers; keep AgentFolio-specific provider wiring outside SATP. |
| `src/routes/identity-v3-routes.js` | `stays in AgentFolio as consumer adapter` | `src/routes/identity-v3-routes.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/reputation-v3-routes.js` | `stays in AgentFolio as consumer adapter` | `src/routes/reputation-v3-routes.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/reviews-routes.js` | `stays in AgentFolio as consumer adapter` | `src/routes/reviews-routes.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/reviews-v3-routes.js` | `stays in AgentFolio as consumer adapter` | `src/routes/reviews-v3-routes.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/satp-api.js` | `stays in AgentFolio as consumer adapter` | `src/routes/satp-api.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/satp-auto-identity-v3.js` | `stays in AgentFolio as consumer adapter` | `src/routes/satp-auto-identity-v3.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/satp-auto-identity.js` | `stays in AgentFolio as consumer adapter` | `src/routes/satp-auto-identity.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/satp-boa-linker-v3.js` | `stays in AgentFolio as consumer adapter` | `src/routes/satp-boa-linker-v3.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/satp-explorer-api.js` | `stays in AgentFolio as consumer adapter` | `src/routes/satp-explorer-api.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as consumer-only code; replace embedded protocol logic with SATP package imports. |
| `src/routes/satp-write-api.js` | `stays in AgentFolio as consumer adapter` | `src/routes/satp-write-api.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/satp-client/MIGRATION-V2-TO-V3.md` | `packages/satp-client/README.md or docs/migration.md` | AgentFolio docs keep links/migration notes only | brainChain; brainForge reviews consumer-facing links | Move into `docs/` or package README under `packages/satp-client/`; de-duplicate during extraction. |
| `src/satp-client/README.md` | `packages/satp-client/README.md or docs/migration.md` | AgentFolio docs keep links/migration notes only | brainChain; brainForge reviews consumer-facing links | Move into `docs/` or package README under `packages/satp-client/`; de-duplicate during extraction. |
| `src/satp-client/examples/integration-patterns.js` | `tests/sdk/ or examples/` | AgentFolio keeps consumer integration coverage only | brainChain for SATP tests/examples; brainForge for AgentFolio tests | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-client/index.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/package-lock.json` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/package.json` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/borsh-reader.d.ts` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/borsh-reader.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/constants.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/index.d.ts` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/index.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/pda.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/schema.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/v3-pda.d.ts` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/v3-pda.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/v3-sdk.d.ts` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/v3-sdk.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/sync-v3.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/test-borsh-reader.js` | `tests/sdk/ or examples/` | AgentFolio keeps consumer integration coverage only | brainChain for SATP tests/examples; brainForge for AgentFolio tests | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-client/test-devnet-integration.js` | `tests/sdk/ or examples/` | AgentFolio keeps consumer integration coverage only | brainChain for SATP tests/examples; brainForge for AgentFolio tests | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-client/test-v3-devnet.js` | `tests/sdk/ or examples/` | AgentFolio keeps consumer integration coverage only | brainChain for SATP tests/examples; brainForge for AgentFolio tests | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-client/test-v3.js` | `tests/sdk/ or examples/` | AgentFolio keeps consumer integration coverage only | brainChain for SATP tests/examples; brainForge for AgentFolio tests | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-client/test.js` | `tests/sdk/ or examples/` | AgentFolio keeps consumer integration coverage only | brainChain for SATP tests/examples; brainForge for AgentFolio tests | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-identity-client.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract protocol-owned client logic into SATP packages; leave AgentFolio route-facing adapter only. |
| `src/satp-reviews-client.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/satp-reviews-onchain.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/satp-reviews.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/satp-write-client.js` | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | AgentFolio adapter/cache wrapper only; no protocol source of truth remains after cutover | brainChain for SATP target; brainForge for AgentFolio adapter compatibility | Extract protocol-owned client logic into SATP packages; leave AgentFolio route-facing adapter only. |
| `tests/satp-explorer-card-parity.test.js` | `stays in AgentFolio as consumer adapter` | `tests/satp-explorer-card-parity.test.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-explorer-client-level-field.test.js` | `stays in AgentFolio as consumer adapter` | `tests/satp-explorer-client-level-field.test.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-explorer-client-profile-match.test.js` | `stays in AgentFolio as consumer adapter` | `tests/satp-explorer-client-profile-match.test.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-explorer-client-program-id.test.js` | `stays in AgentFolio as consumer adapter` | `tests/satp-explorer-client-program-id.test.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-explorer-client-score-field.test.js` | `stays in AgentFolio as consumer adapter` | `tests/satp-explorer-client-score-field.test.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-explorer-route-alias.test.js` | `stays in AgentFolio as consumer adapter` | `tests/satp-explorer-route-alias.test.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-identity-cache-stale-revalidate.test.js` | `stays in AgentFolio as consumer adapter` | `tests/satp-identity-cache-stale-revalidate.test.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-registry.test.js` | `stays in AgentFolio as consumer adapter` | `tests/satp-registry.test.js` | brainForge for AgentFolio consumer adapter; brainChain for SATP boundary | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |

---

## 6. Staged PR sequence

### PR 1 — Architecture docs

Status: complete.

```text
SATP ARCHITECTURE.md in satp repo
AgentFolio ARCHITECTURE.md in agentfolio repo
```

### PR 2 — AgentFolio adapter boundary

Status: in review/landed separately.

```text
Add src/adapters/satp boundary
Add focused tests
No runtime call-site changes
```

### PR 3 — SPEC and extraction map

This PR.

```text
Add SPEC.md
Add EXTRACTION_MAP.md
No code moves
No deploys
No keypair changes
```

### PR 4 — Security docs

```text
Add SECURITY.md
Add docs/key-management.md
Add issuer governance/privacy requirements if not included elsewhere
No keypair movement
No production authority changes
```

### PR 5 — SATP repo scaffolding

```text
Add package directories
Add placeholder package manifests only if needed
Add conformance test skeleton
No npm publish
No deploys
```

### PR 6 — IDL/client migration

```text
Copy/move IDLs and generated client code into satp repo
Add tests proving import/use from satp repo
Do not remove AgentFolio copies until consumer migration passes
```

### PR 7 — AgentFolio consumes SATP dependency

```text
Use Git dependency or workspace/package dependency
Update AgentFolio adapter to call SATP SDK/client
Add consumer integration tests
No product feature changes
```

### PR 8 — Remove embedded source-of-truth copies from AgentFolio

```text
Remove duplicate SATP IDL/client/source-of-truth files
Keep adapter and cached reference fields
Add rollback note and verification commands
```

---

## 7. Review ownership

```text
brainChain: SATP ownership, SPEC, extraction sequencing
brainForge: AgentFolio consumer compatibility and runtime safety
brainShield: key-management/security/privacy review
brainKID: final scope and architecture approval
```

---

## 8. Validation checklist for extraction PRs

Each extraction PR must include:

```text
changed files list
source/target mapping
consumer impact summary
rollback plan
tests run
explicit no-deploy confirmation
explicit no-keypair confirmation
explicit no-npm-publish confirmation
brainForge compatibility note
brainShield security note where relevant
```

---

## 9. Rollback strategy

Docs-only PRs can be reverted directly.

Code/file movement PRs must preserve a temporary compatibility path until AgentFolio consumes SATP successfully. Do not delete AgentFolio copies in the same PR that first adds SATP repo copies unless a tested rollback path exists.

---

## 10. Blockers that require escalation

Escalate to Hani/brainKID before proceeding if any step requires:

```text
production keypair access
mainnet authority action
funds movement
DNS/GitHub/org admin action
paid vendor/account upgrade
public launch or external announcement
client commitments
```

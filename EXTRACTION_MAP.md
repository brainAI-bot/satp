# SATP Extraction Map

**Status:** Draft v1 for SATP-SPEC-001
**Source inspected:** `github.com/brainAI-bot/agentfolio` clone at `main`
**Target:** `github.com/brainAI-bot/satp`
**Last updated:** 2026-05-03

> This map defines what moves from AgentFolio into SATP and what remains AgentFolio consumer-only code. It is a planning/extraction document only: no deploys, no keypair changes, no npm publish, and no AgentFolio product changes are performed by this doc.

---

## 1. Extraction rule

Move protocol source of truth into SATP:

```text
IDLs
PDA helpers
program ID registries
claim schemas
validation level definitions
reputation formula definitions
portable review/escrow helpers
SDK package code
protocol conformance tests
protocol docs
```

Keep consumer/adaptor code in AgentFolio:

```text
Express routes
profile/database cache wiring
marketplace display logic
AgentFolio-specific explorer/search
job/review/escrow product UX
database migration/backfill scripts
consumer integration tests
```

---

## 2. Target package/module boundary

| Target | Owns | Must not own |
| --- | --- | --- |
| `packages/satp-core/` | pure types, claim schemas, validation levels, issuer trust classes, reputation formula types, normalization, conformance helpers | Solana RPC, Express routes, AgentFolio DB/profile code |
| `packages/satp-solana/` | program IDs, IDL exports, PDA derivation, account decoding, transaction builders | AgentFolio routes, AgentFolio DB, UI/display labels |
| `packages/satp-client/` | high-level browser/Node SDK, read helpers, verification helpers, package-facing API | AgentFolio product workflow or persistence |
| `packages/satp/` | umbrella re-export package | migration-only compatibility hacks |
| `idls/` | canonical SATP IDLs by program and network/version | stale AgentFolio copies as source of truth |
| `docs/` | protocol docs and integration guides | AgentFolio launch/product docs |
| `tests/conformance/` | app-agnostic SATP verification tests | AgentFolio-only route tests |

---

## 3. AgentFolio consumer-only residue

AgentFolio may keep these after extraction:

- route handlers that call `@brainai/satp` APIs;
- temporary shims during the Git dependency/package transition;
- database caches of SATP outputs;
- marketplace display labels and UI formatting;
- AgentFolio-specific moderation/search/analytics;
- integration tests proving AgentFolio consumes SATP correctly.

AgentFolio should not remain source of truth for canonical IDLs, PDA derivation, validation levels, reputation formulas, or claim schemas.

---

## 4. Exact source path map

| AgentFolio source path | Classification | SATP target / disposition | Extraction action |
| --- | --- | --- | --- |
| `docs/specs/satp-mcp-README.md` | Docs/spec source | `docs/integration-guide.md or docs/mcp.md` | Move protocol portions into SATP `docs/`; AgentFolio keeps integration guide links only. |
| `satp-client/README.md` | SDK docs | `packages/satp-client/README.md or docs/migration.md` | Move into `docs/` or package README under `packages/satp-client/`; de-duplicate during extraction. |
| `satp-client/idl/satp_escrow.json` | IDL / protocol interface | `idls/satp_escrow.json` | Move canonical SATP IDLs into `idls/`; keep AgentFolio consumer copy only until dependency cutover. |
| `satp-client/package-lock.json` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/package.json` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/constants.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/index.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/pda.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/schema.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/v3-pda.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/src/v3-sdk.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `satp-client/test.js` | SDK tests/examples | `tests/sdk/ or examples/` | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `scripts/backfill-satp-scores.js` | Migration/ops script | `scripts/verify/ if protocol-owned; otherwise stays AgentFolio` | Review case-by-case; protocol validation scripts move to SATP `scripts/verify/`, AgentFolio DB backfills remain AgentFolio. |
| `scripts/migrate-satp-scores.js` | Migration/ops script | `scripts/verify/ if protocol-owned; otherwise stays AgentFolio` | Review case-by-case; protocol validation scripts move to SATP `scripts/verify/`, AgentFolio DB backfills remain AgentFolio. |
| `scripts/one-off/fix-satp-account.js` | Migration/ops script | `scripts/verify/ if protocol-owned; otherwise stays AgentFolio` | Review case-by-case; protocol validation scripts move to SATP `scripts/verify/`, AgentFolio DB backfills remain AgentFolio. |
| `scripts/tests/test-satp.js` | Migration/ops script | `scripts/verify/ if protocol-owned; otherwise stays AgentFolio` | Review case-by-case; protocol validation scripts move to SATP `scripts/verify/`, AgentFolio DB backfills remain AgentFolio. |
| `src/boa_nft_idl.json` | IDL / protocol interface | `docs/agentfolio-adapter.md or examples/agentfolio-adapter/ (not core IDL unless SATP-owned)` | Move canonical SATP IDLs into `idls/`; keep AgentFolio consumer copy only until dependency cutover. |
| `src/lib/satp-boa-linker.js` | Review required | `TBD` | Classify during extraction PR before moving. |
| `src/lib/satp-explorer.js` | Consumer API/explorer adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as consumer-only code; replace embedded protocol logic with SATP package imports. |
| `src/lib/satp-face-registry.js` | Protocol helper/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract app-agnostic verification/registry helpers; keep AgentFolio-specific provider wiring outside SATP. |
| `src/lib/satp-onchain-verify.js` | Protocol helper/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract app-agnostic verification/registry helpers; keep AgentFolio-specific provider wiring outside SATP. |
| `src/lib/satp-registry.js` | Protocol helper/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract app-agnostic verification/registry helpers; keep AgentFolio-specific provider wiring outside SATP. |
| `src/lib/satp-reviews-client.js` | Reviews client/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/lib/satp-reviews-onchain.js` | Reviews client/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/lib/satp-reviews.js` | Reviews client/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/lib/satp-v3-client.ts` | SATP client adapter/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract protocol-owned client logic into SATP packages; leave AgentFolio route-facing adapter only. |
| `src/lib/satp-verification-bridge.js` | Protocol helper/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract app-agnostic verification/registry helpers; keep AgentFolio-specific provider wiring outside SATP. |
| `src/routes/identity-v3-routes.js` | Consumer route adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/reputation-v3-routes.js` | Consumer route adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/reviews-routes.js` | Consumer route adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/reviews-v3-routes.js` | Consumer route adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/satp-api.js` | Consumer route adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/satp-auto-identity-v3.js` | Consumer route adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/satp-auto-identity.js` | Consumer route adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/satp-boa-linker-v3.js` | Consumer route adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/routes/satp-explorer-api.js` | Consumer API/explorer adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as consumer-only code; replace embedded protocol logic with SATP package imports. |
| `src/routes/satp-write-api.js` | Consumer route adapter | `stays in AgentFolio as consumer adapter` | Keep in AgentFolio as route/API surface; remove protocol source-of-truth logic after SATP dependency is wired. |
| `src/satp-client/MIGRATION-V2-TO-V3.md` | SDK docs | `packages/satp-client/README.md or docs/migration.md` | Move into `docs/` or package README under `packages/satp-client/`; de-duplicate during extraction. |
| `src/satp-client/README.md` | SDK docs | `packages/satp-client/README.md or docs/migration.md` | Move into `docs/` or package README under `packages/satp-client/`; de-duplicate during extraction. |
| `src/satp-client/examples/integration-patterns.js` | SDK tests/examples | `tests/sdk/ or examples/` | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-client/index.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/package-lock.json` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/package.json` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/borsh-reader.d.ts` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/borsh-reader.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/constants.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/index.d.ts` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/index.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/pda.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/schema.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/v3-pda.d.ts` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/v3-pda.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/v3-sdk.d.ts` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/src/v3-sdk.js` | SDK/client source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Move protocol-owned source into `packages/satp-client/` or split pure helpers into `packages/satp-core/` and Solana helpers into `packages/satp-solana/`. |
| `src/satp-client/sync-v3.js` | Unsafe executable sync script | Do not extract | Exclude from PR #5: contained hardcoded mainnet RPC/keypair path/sign-send/score mutation behavior. |
| `src/satp-client/test-borsh-reader.js` | SDK tests/examples | `tests/sdk/ or examples/` | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-client/test-devnet-integration.js` | SDK tests/examples | `tests/sdk/ or examples/` | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-client/test-v3-devnet.js` | SDK tests/examples | `tests/sdk/ or examples/` | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-client/test-v3.js` | SDK tests/examples | `tests/sdk/ or examples/` | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-client/test.js` | SDK tests/examples | `tests/sdk/ or examples/` | Move into `tests/sdk/` or `examples/`; adapt imports to `@brainai/satp*`. |
| `src/satp-identity-client.js` | SATP client adapter/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract protocol-owned client logic into SATP packages; leave AgentFolio route-facing adapter only. |
| `src/satp-reviews-client.js` | Reviews client/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/satp-reviews-onchain.js` | Reviews client/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/satp-reviews.js` | Reviews client/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract review protocol helpers into SATP packages; AgentFolio keeps display/moderation adapter only. |
| `src/satp-write-client.js` | SATP client adapter/source | `packages/satp-client/ + packages/satp-solana/ + packages/satp-core/ split` | Extract protocol-owned client logic into SATP packages; leave AgentFolio route-facing adapter only. |
| `tests/satp-explorer-card-parity.test.js` | Consumer integration test | `stays in AgentFolio as consumer adapter` | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-explorer-client-level-field.test.js` | Consumer integration test | `stays in AgentFolio as consumer adapter` | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-explorer-client-profile-match.test.js` | Consumer integration test | `stays in AgentFolio as consumer adapter` | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-explorer-client-program-id.test.js` | Consumer integration test | `stays in AgentFolio as consumer adapter` | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-explorer-client-score-field.test.js` | Consumer integration test | `stays in AgentFolio as consumer adapter` | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-explorer-route-alias.test.js` | Consumer integration test | `stays in AgentFolio as consumer adapter` | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-identity-cache-stale-revalidate.test.js` | Consumer integration test | `stays in AgentFolio as consumer adapter` | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |
| `tests/satp-registry.test.js` | Consumer integration test | `stays in AgentFolio as consumer adapter` | Keep AgentFolio consumer tests, then add SATP conformance equivalents under SATP `tests/conformance/`. |

---

## 5. Extraction phases

### Phase A — docs and map

- Add `SPEC.md` and this `EXTRACTION_MAP.md`.
- Confirm no deploy/keypair/npm publish/AgentFolio product change.
- Ask brainForge to review AgentFolio adapter compatibility.

### Phase B — IDL and constants extraction

- Copy canonical IDLs into `idls/`.
- Add program ID registry and PDA helper boundaries.
- Add validation that IDLs parse and export without AgentFolio imports.

### Phase C — SDK extraction

- Move pure schema/types to `packages/satp-core/`.
- Move Solana helpers to `packages/satp-solana/`.
- Move high-level client API to `packages/satp-client/`.
- Add SDK build/test gates.

### Phase D — AgentFolio adapter

- Change AgentFolio imports to use the SATP package/Git dependency.
- Leave routes and DB caches in AgentFolio.
- Keep consumer integration tests in AgentFolio and add conformance equivalents in SATP.

### Phase E — cleanup

- Remove duplicated protocol source-of-truth files from AgentFolio after compatibility is proven.
- Keep migration notes and adapter docs pointing to SATP.

---

## 6. Guardrails

This extraction map does not authorize:

```text
Solana devnet deploys
Solana mainnet deploys
production keypair changes
keypair movement
secret printing
npm publish
AgentFolio product feature work
Masthead/client/public launch work
```

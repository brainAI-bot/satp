# SATP-EXTRACT-001 moved file map

**Task:** `TASK-627b39a7 / SATP-EXTRACT-001`  
**Source repo inspected:** `github.com/brainAI-bot/agentfolio`  
**Target repo:** `github.com/brainAI-bot/satp`  
**Last updated:** 2026-05-03

This map records the branch/PR-only extraction of SATP IDLs, client scaffolding, and SATP source-of-truth/migration docs into the SATP repo. It does not deploy programs, move keypairs, publish npm packages, touch mainnet/devnet, or change AgentFolio product code.

## Moved/copied into SATP

| Source path | Target path | Notes |
| --- | --- | --- |
| `agentfolio/satp-idls/attestations.json` | `satp/idls/attestations.json` | Canonical SATP IDL source copied into root IDL set. |
| `agentfolio/satp-idls/identity_registry.json` | `satp/idls/identity_registry.json` | Canonical SATP IDL source copied into root IDL set. |
| `agentfolio/satp-idls/reputation.json` | `satp/idls/reputation.json` | Canonical SATP IDL source copied into root IDL set. |
| `agentfolio/satp-idls/reviews.json` | `satp/idls/reviews.json` | Canonical SATP IDL source copied into root IDL set. |
| `agentfolio/satp-idls/validation.json` | `satp/idls/validation.json` | Canonical SATP IDL source copied into root IDL set. |
| `agentfolio/satp-client/idl/satp_escrow.json` | `satp/idls/satp_escrow.json` | Escrow IDL copied from SDK IDL folder; no deploy or program change. |
| `agentfolio/src/idl/attestations.json` | `satp/idls/agentfolio-current/attestations.json` | AgentFolio current embedded IDL copy preserved for compatibility diffing. |
| `agentfolio/src/idl/identity_registry.json` | `satp/idls/agentfolio-current/identity_registry.json` | AgentFolio current embedded IDL copy preserved for compatibility diffing. |
| `agentfolio/src/idl/reputation.json` | `satp/idls/agentfolio-current/reputation.json` | AgentFolio current embedded IDL copy preserved for compatibility diffing. |
| `agentfolio/src/idl/reviews.json` | `satp/idls/agentfolio-current/reviews.json` | AgentFolio current embedded IDL copy preserved for compatibility diffing. |
| `agentfolio/src/idl/validation.json` | `satp/idls/agentfolio-current/validation.json` | AgentFolio current embedded IDL copy preserved for compatibility diffing. |
| `agentfolio/src/idl-devnet-backup/attestations.json` | `satp/idls/devnet-backup/attestations.json` | Devnet backup IDL copy preserved as historical context only; no deploy. |
| `agentfolio/src/idl-devnet-backup/identity_registry.json` | `satp/idls/devnet-backup/identity_registry.json` | Devnet backup IDL copy preserved as historical context only; no deploy. |
| `agentfolio/src/idl-devnet-backup/reputation.json` | `satp/idls/devnet-backup/reputation.json` | Devnet backup IDL copy preserved as historical context only; no deploy. |
| `agentfolio/src/idl-devnet-backup/reviews.json` | `satp/idls/devnet-backup/reviews.json` | Devnet backup IDL copy preserved as historical context only; no deploy. |
| `agentfolio/src/idl-devnet-backup/validation.json` | `satp/idls/devnet-backup/validation.json` | Devnet backup IDL copy preserved as historical context only; no deploy. |
| `agentfolio/src/satp-client/MIGRATION-V2-TO-V3.md` | `satp/packages/satp-client/MIGRATION-V2-TO-V3.md` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/README.md` | `satp/packages/satp-client/README.md` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/examples/integration-patterns.js` | `satp/packages/satp-client/examples/integration-patterns.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/index.js` | `satp/packages/satp-client/index.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/package-lock.json` | `satp/packages/satp-client/package-lock.json` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/package.json` | `satp/packages/satp-client/package.json` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/borsh-reader.d.ts` | `satp/packages/satp-client/src/borsh-reader.d.ts` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/borsh-reader.js` | `satp/packages/satp-client/src/borsh-reader.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/constants.js` | `satp/packages/satp-client/src/constants.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/index.d.ts` | `satp/packages/satp-client/src/index.d.ts` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/index.js` | `satp/packages/satp-client/src/index.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/pda.js` | `satp/packages/satp-client/src/pda.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/schema.js` | `satp/packages/satp-client/src/schema.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/v3-pda.d.ts` | `satp/packages/satp-client/src/v3-pda.d.ts` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/v3-pda.js` | `satp/packages/satp-client/src/v3-pda.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/v3-sdk.d.ts` | `satp/packages/satp-client/src/v3-sdk.d.ts` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/src/v3-sdk.js` | `satp/packages/satp-client/src/v3-sdk.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/sync-v3.js` | `satp/packages/satp-client/sync-v3.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/test-borsh-reader.js` | `satp/packages/satp-client/test-borsh-reader.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/test-devnet-integration.js` | `satp/packages/satp-client/test-devnet-integration.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/test-v3-devnet.js` | `satp/packages/satp-client/test-v3-devnet.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/test-v3.js` | `satp/packages/satp-client/test-v3.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/src/satp-client/test.js` | `satp/packages/satp-client/test.js` | SATP v3 client scaffold copied; package metadata adjusted to private extraction scaffold. |
| `agentfolio/docs/specs/SATP_V3_INTEGRATION.md` | `satp/docs/migration/agentfolio-satp-v3-integration.md` | Legacy AgentFolio SATP integration notes copied under migration docs. |
| `agentfolio/docs/specs/satp-mcp-README.md` | `satp/docs/mcp.md` | SATP MCP integration notes copied as protocol-adjacent docs. |

## Intentionally not moved in SATP-EXTRACT-001

| AgentFolio path/pattern | Reason |
| --- | --- |
| `agentfolio/docs/specs/SPEC.md` | AgentFolio product/platform spec, not SATP protocol source of truth. |
| `agentfolio/docs/specs/MARKETPLACE-SPEC.md` | AgentFolio marketplace product spec, consumer-owned. |
| `agentfolio/docs/specs/DESIGN-BRIEF*.md` | AgentFolio product design briefs, consumer-owned. |
| `agentfolio/satp-client/src/*` | Older v2 SDK duplicate not moved as package; escrow IDL only copied. Current v3 SDK source came from src/satp-client/. |
| `agentfolio/src/routes/*satp* and *identity-v3* routes` | Express/API consumer adapters remain in AgentFolio until consume/dependency PR. |
| `agentfolio/src/lib/satp-explorer.js and route-facing helpers` | AgentFolio explorer/search/display adapters remain consumer-owned. |
| `agentfolio/scripts/backfill-satp-scores.js, migrate-satp-scores.js, one-off/fix-satp-account.js` | AgentFolio DB/ops scripts remain consumer-owned; no database or chain writes in this task. |
| `agentfolio/tests/satp-*.test.js` | Consumer integration tests remain in AgentFolio; conformance equivalents are follow-up build/test work. |

## Follow-up split expected in SATP-BUILD-001

- Split pure schemas/types from `packages/satp-client/src/` into `packages/satp-core/`.
- Split program IDs, IDL exports, PDA helpers, account decoders, and transaction builders into `packages/satp-solana/`.
- Keep `packages/satp-client/` as the high-level browser/Node SDK.
- Keep package files private until an explicit npm publish task is approved.
- Add conformance tests before AgentFolio consumes SATP as package/Git dependency.

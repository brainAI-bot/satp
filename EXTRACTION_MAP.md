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

The exact path inventory must be generated in the extraction PR from `git ls-files` and reviewed by brainForge before any move.

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

## 5. Staged PR sequence

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

## 6. Review ownership

```text
brainChain: SATP ownership, SPEC, extraction sequencing
brainForge: AgentFolio consumer compatibility and runtime safety
brainShield: key-management/security/privacy review
brainKID: final scope and architecture approval
```

---

## 7. Validation checklist for extraction PRs

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

## 8. Rollback strategy

Docs-only PRs can be reverted directly.

Code/file movement PRs must preserve a temporary compatibility path until AgentFolio consumes SATP successfully. Do not delete AgentFolio copies in the same PR that first adds SATP repo copies unless a tested rollback path exists.

---

## 9. Blockers that require escalation

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

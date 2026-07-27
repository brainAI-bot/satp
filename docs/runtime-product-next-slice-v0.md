# SATP runtime/product next slice v0

HQ task: `SATP-RUNTIME-PRODUCT-NEXT-SLICE-PR-20260726-2111Z`
GitHub issue: [#14 SATP post-S6 roadmap](https://github.com/brainAI-bot/satp/issues/14)

Issue #14 correction: Owner approval `REQ-cc84fa3a` supersedes the stale
`2.0.1` npm target in the issue body. Line 13 should allow the already
approved stable `@brainai/satp-client@2.0.2` target while preserving the ban on
new npm publishes from this roadmap, and line 213 should make
`AF-SATP-NPM-CONSUME-001` verify AgentFolio against
`@brainai/satp-client@2.0.2`. That consume task is unblocked from the impossible
`2.0.1` target, but remains limited to read-only consume verification.

Status: PR-first implementation and design carrier. This document defines the
next engineering slices needed to make SATP easier to consume from host
runtimes while keeping all behavior offline, read-only, and reviewable.

Follow-up implementation:

- `SATP-ISSUE14-NEXT-SLICE-AFTER-PR111-20260727-0217Z` adds the
  `createRuntimePolicyAdapter` package-root helper, type declarations, core
  package re-export, docs, and offline tests for the first SDK ergonomics
  checklist item after PR #111.

This slice does not publish npm packages, write to Solana devnet/mainnet, read
or change keypairs, deploy or restart production systems, spend funds, contact
clients, make public announcements, or replace AgentFolio product code.

## Product goal

SATP should be simple for third-party runtimes to adopt as a local trust and
attestation layer:

- Hosts can evaluate a SATP identity packet against an action with a stable
  runtime policy adapter.
- SDK users can discover the safe top-level helpers without depending on
  private workspace internals.
- Identity attestation request packets can be built and verified locally before
  any separate signing or on-chain workflow is approved.
- MCP and x402 examples show how paid evidence lookup and protected tools fit
  together without treating payment as action authorization.
- AgentFolio remains the reference consumer, not the SATP source of truth.

## Off-chain runtime policy adapter API shape

The existing `docs/runtime-policy-adapter-v0.md` and
`packages/satp-client/src/runtime-policy-adapter.js` define the current
low-level helpers:

- `buildRuntimePolicyActionDescriptor(input, overrides)`
- `evaluateRuntimePolicy(identityPayload, actionDescriptor, options)`
- `buildRuntimePolicyAuditTrace(identityPayload, actionDescriptor, options)`

The next engineering slice should keep those helpers stable and add a small
host-oriented adapter constructor:

```js
const {
  createRuntimePolicyAdapter,
} = require('@brainai/satp-client');

const adapter = createRuntimePolicyAdapter({
  policy: {
    minimumTrustScore: 70,
    denyTrustScoreBelow: 25,
    maxAutoSpendUsd: 0,
    requireVerifiedIdentity: true,
  },
  now: () => new Date('2026-07-26T00:00:00Z'),
});

const action = adapter.action({
  type: 'mcp_protected_tool',
  resource: 'mcp://protected/deploy-readiness',
  capability: 'mcp:deploy-readiness',
  requiresFreshEvidence: true,
});

const result = adapter.evaluate(identityPayload, action, {
  operatorApproved: false,
  actionPaymentPreapproved: false,
  evidenceLookupPaymentPreapproved: false,
});

const trace = adapter.auditTrace(identityPayload, action, { result });
```

Proposed constructor contract:

| Field | Type | Notes |
| --- | --- | --- |
| `policy` | object | Same policy keys accepted by `evaluateRuntimePolicy`; merged with `DEFAULT_POLICY`. |
| `now` | function or ISO string | Optional deterministic clock for tests and audit traces. |
| `redact` | function | Optional host redactor for resource labels before trace emission. |
| `defaultActionType` | string | Optional host default for generic action descriptors. |

Proposed adapter methods:

| Method | Return | Notes |
| --- | --- | --- |
| `action(input, overrides)` | action descriptor | Thin wrapper around `buildRuntimePolicyActionDescriptor`. |
| `evaluate(identity, action, options)` | policy result | Thin wrapper around `evaluateRuntimePolicy`, always local. |
| `auditTrace(identity, action, options)` | redacted trace | Thin wrapper around `buildRuntimePolicyAuditTrace`. |
| `explain(result)` | string array | Stable, user-displayable reason summaries derived from reason codes. |

Non-goals:

- No RPC access, signing, transaction building, deploys, npm publishing, paid
  endpoint calls, or production mutation.
- No host-specific authorization bypass. `allow` means local policy passed; it
  does not grant privileges outside the host's own enforcement layer.
- No AgentFolio dependency. AgentFolio is one consumer fixture and review target.

## SDK ergonomics checklist

The next SDK slice is ready to implement when these checks are true:

- Top-level exports include `createRuntimePolicyAdapter` next to the existing
  runtime policy helpers.
- Type declarations describe the adapter constructor, action descriptors,
  policy options, decisions, reason codes, audit trace shape, and explain output.
- Helper names are stable and host-oriented: `action`, `evaluate`,
  `auditTrace`, and `explain`.
- Errors fail closed for malformed identity payloads, malformed action
  descriptors, invalid costs, invalid networks, and invalid public keys.
- Examples use `@brainai/satp-client` top-level imports, not `src/*` imports.
- Docs show stable npm usage for consumers and Git SHA pins only for explicit
  HQ review coordination.
- The package remains safe to run offline with fixture data.
- `npm run check:exports`, `npm run test:runtime-policy`, and
  `npm run check:examples` cover the public export and example paths.
- README and package docs distinguish local policy decisions from payment,
  signing, deployment, and production authorization.

## Identity attestation helper local request/verify spec

The existing `prepareIdentityAttestationRequest(opts)` builds an unsigned,
read-only request. The next slice should add a local verifier that confirms a
request was built from the expected public inputs and has not been modified:

```js
const {
  prepareIdentityAttestationRequest,
  verifyIdentityAttestationRequest,
} = require('@brainai/satp-client');

const request = prepareIdentityAttestationRequest({
  subjectWallet: '11111111111111111111111111111111',
  agentId: 'brainchain-demo',
  claimType: 'identity',
  metadataHash: '93d122f8879fe87c186c10a00db8fbc80a73cecd2ede44b9ffa6410be3c2b805',
  network: 'devnet',
});

const verification = verifyIdentityAttestationRequest(request, {
  expectedSubjectWallet: '11111111111111111111111111111111',
  expectedAgentId: 'brainchain-demo',
  expectedClaimType: 'identity',
  expectedNetwork: 'devnet',
});

if (!verification.ok) throw new Error(verification.errors.join('; '));
```

Verifier requirements:

- Recompute the request hash using the same canonical JSON rules as the builder.
- Recompute `agentIdHash`, Genesis PDA, attestation PDA, bumps, and program IDs
  from public inputs.
- Require `schemaVersion: 'satp.identityAttestationRequest.v1'`,
  `requestType: 'identity-attestation'`, `mode: 'unsigned-readonly-request'`,
  `signingRequired: false`, `unsigned: true`, empty `instructions`, empty
  `signers`, and `transaction: null`.
- Accept optional expectations for subject wallet, agent id, claim type,
  metadata hash, attester, network, and expiration.
- Return `{ ok: boolean, errors: string[], warnings: string[] }`.
- Never read a keypair, require a signer, call RPC, build a transaction, send a
  transaction, write chain state, or publish a package.

Initial negative fixtures should cover a changed `metadataHash`, changed
`requestHash`, wrong network, non-empty `signers`, non-null `transaction`, and
unexpected `instructions`.

## MCP, x402, and SATP examples plan

The current `examples/mcp-x402-readonly` example should remain the canonical
repo-owned fixture-first MCP/x402 runtime surface.

Next example additions:

1. Add a runtime adapter example path that evaluates an MCP protected tool with
   fresh local SATP evidence and returns `allow`.
2. Add a stale-evidence path with an x402 evidence lookup descriptor that returns
   `needs_approval` until `evidenceLookupPaymentPreapproved` is true.
3. Add a paid-action path showing `X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION` in
   the reason codes, proving payment does not bypass host policy.
4. Add a local identity attestation request verification path that prepares a
   request and verifies it from public inputs.
5. Keep all example tests offline by default. RPC mode must stay opt-in through
   an explicit environment flag and must remain read-only.

Expected checks for this section:

```bash
npm --prefix examples/mcp-x402-readonly run check
npm --prefix examples/mcp-x402-readonly test
npm run test:runtime-policy
npm run test:attestation-request
```

## AgentFolio reference-consumer follow-through

AgentFolio remains the first reference consumer, but SATP owns the package,
runtime policy, and fixture contracts. Follow-through should be coordinated as a
separate AgentFolio-side task only after the SATP PR merges or a reviewed SATP
commit SHA is selected.

SATP-side deliverables before AgentFolio consumes a reviewed commit:

- Update `docs/agentfolio-consumption-readiness.md` with the exact SATP commit
  SHA and reason for any temporary Git pin.
- Keep stable npm as the default install form unless a separate HQ release task
  publishes a new package.
- Keep AgentFolio examples read-only and fixture-first.
- Do not mutate AgentFolio product code, production dependencies, marketplace
  policy, launch copy, runtime services, credentials, or deploy state from this
  SATP task.

AgentFolio-side acceptance should require:

- A reviewed SATP commit SHA or stable npm version.
- A local trust gate using the SATP runtime adapter.
- A visible audit trace that redacts URLs, tokens, raw capabilities, and private
  evidence payloads.
- A rollback note returning to stable npm if the Git pin was temporary.

## Acceptance traceability

| Required area | Covered by |
| --- | --- |
| Runtime policy adapter API shape | `Off-chain runtime policy adapter API shape` |
| SDK ergonomics checklist | `SDK ergonomics checklist` |
| Identity attestation helper local request/verify spec | `Identity attestation helper local request/verify spec` |
| MCP/x402/SATP examples plan | `MCP, x402, and SATP examples plan` |
| AgentFolio reference-consumer follow-through | `AgentFolio reference-consumer follow-through` |
| Issue #14 linkage | Header link to `brainAI-bot/satp#14` |
| HQ task id linkage | Header task id |

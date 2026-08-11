# Runtime policy adapter v0

This local/off-chain adapter turns an authenticated runtime context into one of four decisions:

- allow: local checks pass.
- deny: local checks fail hard.
- degrade: local checks allow only a reduced capability path.
- needs_approval: local checks require operator or payment approval before continuing.

It does not write to Solana, use keypairs, deploy contracts, publish packages, spend funds, or authorize production actions.

## API shape

External actors must use `evaluateRuntimePolicyContext`. `subject_id` is the identity whose policy is evaluated; `actor_id` is the caller performing the action. They are separate security principals. Caller-supplied `actor` fields are informational and never prove authentication or capabilities. A host/verifier must produce `actor_evidence` bound to the subject, actor, and action.

~~~js
const { evaluateRuntimePolicyContext } = require('@brainai/satp-client');

const result = evaluateRuntimePolicyContext({
  subject_id: 'agentfolio-subject-42',
  subject: {
    active: true,
    satpVerified: true,
    trustScore: 88,
    evidenceUpdatedAt: '2026-05-21T00:00:00Z'
  },
  actor_id: 'mcp-runtime-7',
  actor: { actor_id: 'mcp-runtime-7' },
  actor_evidence: {
    verifier_id: 'satp-host-verifier',
    authenticated: true,
    verified_at: '2026-05-21T00:00:00Z',
    expires_at: '2026-05-21T01:00:00Z',
    revoked: false,
    subject_id: 'agentfolio-subject-42',
    actor_id: 'mcp-runtime-7',
    action_id: 'action-read-1',
    delegation_depth: 1,
    capabilities: ['mcp:read']
  },
  action: {
    action_id: 'action-read-1',
    type: 'mcp_protected_tool',
    resource: 'mcp://protected/read',
    requiresCapability: 'mcp:read',
    requiresFreshEvidence: true
  }
}, {
  now: '2026-05-21T00:05:00Z',
  policy: {
    actorEvidenceStaleAfterMs: 900000,
    maxDelegationDepth: 1
  }
});
~~~

Missing actor evidence returns `needs_approval`. Unverified, revoked, mismatched, or over-delegated evidence returns `deny`. Stale, expired, or future-dated evidence returns `needs_approval`.

The older `evaluateRuntimePolicy(identityPayload, actionDescriptor, options)` API remains available for trusted in-process identity payloads and backward compatibility. Do not use it to authenticate an external caller from self-asserted actor context.

~~~js
const { evaluateRuntimePolicy } = require('@brainai/satp-client');

const result = evaluateRuntimePolicy(identityPayload, actionDescriptor, {
  now: '2026-05-21T00:00:00Z',
  actionPaymentPreapproved: false,
  evidenceLookupPaymentPreapproved: false,
  operatorApproved: false,
  policy: {
    minimumTrustScore: 70,
    denyTrustScoreBelow: 25,
    maxAutoSpendUsd: 0,
    requireVerifiedIdentity: true,
    staleEvidenceAfterMs: 604800000,
  },
});
~~~

For host logs or review queues, use the redacted audit-trace helper:

~~~js
const { buildRuntimePolicyAuditTrace } = require('@brainai/satp-client');

const trace = buildRuntimePolicyAuditTrace(identityPayload, actionDescriptor, {
  now: '2026-05-21T00:00:00Z',
});
~~~

For host runtimes, build a normalized action descriptor before evaluation:

~~~js
const { buildRuntimePolicyActionDescriptor, evaluateRuntimePolicy } = require('@brainai/satp-client');

const action = buildRuntimePolicyActionDescriptor({
  type: 'mcp_protected_tool',
  resource: 'mcp://protected/deploy-readiness',
  capability: 'mcp:deploy-readiness'
});

const result = evaluateRuntimePolicy(identityPayload, action, {
  now: '2026-05-21T00:00:00Z'
});
~~~

Input identity payload:

~~~json
{
  "agentId": "brainchain-demo",
  "active": true,
  "satpVerified": true,
  "trustScore": 88,
  "capabilities": ["mcp:deploy-readiness", "satp:trust-read"],
  "evidenceUpdatedAt": "2026-05-21T00:00:00Z"
}
~~~

Input action descriptor:

~~~json
{
  "type": "mcp_protected_tool",
  "resource": "mcp://protected/deploy-readiness",
  "operation": "read",
  "requiresCapability": "mcp:deploy-readiness",
  "minimumTrustScore": 70,
  "allowDegraded": false,
  "requiresFreshEvidence": true,
  "costUsd": 0
}
~~~

Output:

~~~json
{
  "decision": "allow",
  "reasonCodes": ["TRUST_SCORE_OK", "EVIDENCE_FRESH", "LOCAL_POLICY_ALLOW"],
  "message": "Local runtime policy allows the action.",
  "checks": {
    "identityActive": true,
    "identityVerified": true,
    "hasCapability": true,
    "trustScore": 88,
    "minimumTrustScore": 70,
    "evidenceFresh": true,
    "actionCostUsd": 0,
    "maxAutoSpendUsd": 0
  }
}
~~~

## Reason codes

Authenticated runtime context:

- SUBJECT_ID_MISSING, ACTOR_ID_MISSING, ACTION_ID_MISSING: required binding identifiers are absent.
- ACTOR_EVIDENCE_MISSING: caller actor context has no verifier-produced evidence; approval is required.
- ACTOR_EVIDENCE_UNVERIFIED: the evidence lacks a verifier ID, authenticated flag, or valid verification timestamp.
- ACTOR_EVIDENCE_REVOKED: the verifier evidence is revoked.
- ACTOR_EVIDENCE_STALE: verifier evidence is stale, expired, or future-dated.
- ACTOR_EVIDENCE_ACTOR_MISMATCH, ACTOR_EVIDENCE_SUBJECT_MISMATCH, ACTION_CONTEXT_MISMATCH: evidence bindings do not match the evaluated context.
- ACTOR_EVIDENCE_VERIFIED: verifier-produced evidence passed authentication and freshness checks.
- DELEGATION_DEPTH_OK, DELEGATION_DEPTH_EXCEEDED: delegation is within or beyond local policy.
- X402_LOOKUP_CONTEXT_MISMATCH, X402_SETTLEMENT_CONTEXT_MISMATCH: payment metadata is not bound to the same subject, actor, and action.
- X402_SETTLEMENT_UNVERIFIED: the settlement is not both settled and verifier-attributed.
- X402_SETTLEMENT_NOT_TASK_OUTCOME_PROOF: settlement proves only the payment state, never successful task completion.

Legacy/local identity policy:

- IDENTITY_INACTIVE: the identity is disabled locally.
- IDENTITY_UNVERIFIED: verified identity is required, but missing.
- MISSING_CAPABILITY: the action requires a capability not present in the identity payload.
- TRUST_SCORE_BELOW_DENY_FLOOR: trust score is below the local deny floor.
- TRUST_SCORE_BELOW_MINIMUM: trust score is below the action or policy minimum.
- TRUST_SCORE_OK: trust score meets the local threshold.
- EVIDENCE_FRESH: local evidence is within the freshness window.
- EVIDENCE_STALE_OR_MISSING: local evidence is absent or stale.
- X402_LOOKUP_REQUIRES_APPROVAL: a paid x402 lookup path exists, but payment approval is not present.
- X402_LOOKUP_PAYMENT_PREAPPROVED: payment for an x402 lookup was preapproved.
- ACTION_PAYMENT_NEEDS_APPROVAL: the action cost exceeds local auto-spend policy.
- ACTION_PAYMENT_PREAPPROVED: payment was approved for the paid endpoint.
- PROTECTED_TOOL_REQUIRES_APPROVAL: a protected tool requires operator approval.
- X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION: payment only grants lookup/access to paid data.
- LOCAL_POLICY_ALLOW: local checks allow the action.

## Audit trace

`buildRuntimePolicyAuditTrace` wraps `evaluateRuntimePolicy` and returns a host-log-friendly record:

~~~json
{
  "schemaVersion": "satp.runtimePolicyAuditTrace.v1",
  "mode": "offline-local-runtime-policy-trace",
  "generatedAt": "2026-05-21T00:00:00.000Z",
  "decision": "allow",
  "reasonCodes": ["TRUST_SCORE_OK", "EVIDENCE_FRESH", "LOCAL_POLICY_ALLOW"],
  "subject": {
    "agentId": "brainchain-demo",
    "active": true,
    "verified": true,
    "trustScoreBand": "80-89",
    "evidenceUpdatedAt": "2026-05-21T00:00:00Z",
    "capabilityCount": 2
  },
  "action": {
    "type": "mcp_protected_tool",
    "operation": "read",
    "resourceKind": "mcp:",
    "requiresCapability": "mcp:deploy-readiness",
    "requiresFreshEvidence": true,
    "protectedTool": true,
    "operatorApprovalRequired": false,
    "costUsd": 0,
    "evidenceLookup": null
  },
  "guardrails": {
    "localDecisionOnly": true,
    "writesSolanaState": false,
    "usesKeypairs": false,
    "deploysPrograms": false,
    "publishesPackages": false,
    "authorizesPayment": false,
    "authorizesAgentActionFromPayment": false
  }
}
~~~

The trace intentionally records score bands, capability counts, resource kind, and redacted x402 lookup metadata instead of raw capability lists, full URLs, private endpoint query strings, tokens, or key material.

## Examples

MCP protected tool:

~~~js
evaluateRuntimePolicy(identity, {
  type: 'mcp_protected_tool',
  resource: 'mcp://protected/deploy-readiness',
  operation: 'read',
  requiresCapability: 'mcp:deploy-readiness',
  requiresFreshEvidence: true,
});
~~~

x402 paid endpoint:

~~~js
evaluateRuntimePolicyContext({
  subject_id: 'agentfolio-subject-42',
  subject: identity,
  actor_id: 'x402-runtime-7',
  actor_evidence: verifierProducedActorEvidence,
  action: {
    action_id: 'reputation-lookup-1',
    type: 'x402_endpoint',
    resource: 'https://api.example.test/reputation',
    operation: 'lookup',
    costUsd: 0.05
  },
  x402: {
    settlement: {
      subject_id: 'agentfolio-subject-42',
      actor_id: 'x402-runtime-7',
      action_id: 'reputation-lookup-1',
      resource: 'https://api.example.test/reputation',
      settlement_id: 'settlement-123',
      status: 'settled',
      verified_by: 'x402-host-verifier'
    }
  }
}, {
  policy: { maxAutoSpendUsd: 0 }
});
~~~

A matching verified settlement can satisfy the local payment gate. It does not authenticate the actor, authorize the action, or prove the task outcome.

AgentFolio trust-score gate:

~~~js
evaluateRuntimePolicy({ ...identity, trustScore: 62 }, {
  type: 'agentfolio_trust_gate',
  minimumTrustScore: 80,
  allowDegraded: true,
});
~~~

Hosts that expose this as a generic runtime trust-score gate can use `host_trust_gate`; it maps to the same AgentFolio trust-score resource, `agentfolio:trust-read` capability, and degraded-access behavior.

Optional paid x402 reputation/evidence lookup when local evidence is missing or stale:

~~~js
evaluateRuntimePolicy({ ...identity, evidenceUpdatedAt: null }, {
  type: 'mcp_protected_tool',
  requiresFreshEvidence: true,
  evidenceLookup: {
    type: 'x402',
    endpoint: 'https://api.example.test/evidence',
    maxCostUsd: 0.05,
  },
});
~~~

Host action descriptor builder:

~~~js
buildRuntimePolicyActionDescriptor({
  type: 'agentfolio_trust_gate',
  profileId: 'brainchain-demo',
  minimumTrustScore: 80
});

buildRuntimePolicyActionDescriptor('x402_endpoint', {
  resource: 'https://api.example.test/reputation',
  costUsd: 0.05
});
~~~

The descriptor builder is offline and only prepares local policy input. Its guardrails state that it does not write Solana state, use keypairs, deploy programs, publish packages, or require live payment.

## Security note

Policy decisions remain local to the host. SATP identity and host-provided trust signals are inputs to local policy, not blanket authorization. Hosts are responsible for producing and authenticating `actor_evidence`; v0 validates its structure, freshness, revocation flag, bindings, capabilities, and delegation depth but does not define a cryptographic evidence format or contact a verifier. x402 payment grants lookup or endpoint access only; it does not authenticate the actor, authorize the agent action, bypass protected-tool approval, replace host policy, or prove successful task completion.

The adapter performs no live evidence lookup or settlement. Optional x402 lookup and settlement objects are verifier-provided context and must be bound to the same `subject_id`, `actor_id`, `action_id`, and, when present, resource. Audit traces still use the legacy identity/action helper; callers should separately log redacted actor-evidence provenance if needed.

## SATP repo integration

This PR integrates the adapter into @brainai/satp-client as packages/satp-client/src/runtime-policy-adapter.js and exports evaluateRuntimePolicyContext, evaluateRuntimePolicy, buildRuntimePolicyActionDescriptor, buildRuntimePolicyAuditTrace, DECISIONS, REASON_CODES, DEFAULT_POLICY, RUNTIME_POLICY_HOST_ACTION_DESCRIPTOR_SCHEMA_VERSION, and RUNTIME_POLICY_AUDIT_TRACE_SCHEMA_VERSION from the package root. The package path is branch/PR-only for review; no npm publish or dist-tag change is part of this artifact.

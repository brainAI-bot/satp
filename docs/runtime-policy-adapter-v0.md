# Runtime policy adapter v0

This local/off-chain adapter turns an agent identity/trust payload and an action descriptor into one of four decisions:

- allow: local checks pass.
- deny: local checks fail hard.
- degrade: local checks allow only a reduced capability path.
- needs_approval: local checks require operator or payment approval before continuing.

It does not write to Solana, use keypairs, deploy contracts, publish packages, spend funds, or authorize production actions.

## API shape

~~~js
const { evaluateRuntimePolicy } = require('@brainai/satp-client');

const result = evaluateRuntimePolicy(identityPayload, actionDescriptor, {
  now: '2026-05-21T00:00:00Z',
  actionPaymentPreapproved: false,
  evidenceLookupPaymentPreapproved: false,
  operatorApproved: false,
  x402_settlement: null,
  policy: {
    minimumTrustScore: 70,
    denyTrustScoreBelow: 25,
    maxAutoSpendUsd: 0,
    requireVerifiedIdentity: true,
    staleEvidenceAfterMs: 604800000,
    maxActorEvidenceAgeMs: 900000,
    maxDelegationDepth: 1,
    maxSettlementAgeMs: 900000,
  },
});
~~~

### Authenticated subject and actor context

New integrations should identify the subject whose trust is being evaluated separately from the actor requesting the action. Supplying `actor_id` is not authentication. Once any explicit subject/actor field is present, the adapter fails closed unless `actor_evidence` is produced by a named verifier, current, unrevoked, bound to both identities and the exact action, and within the host delegation-depth policy.

~~~js
const action = buildRuntimePolicyActionDescriptor({
  action_id: 'invoke-42',
  type: 'mcp_protected_tool',
  resource: 'mcp://protected/deploy-readiness',
  operation: 'invoke',
  capability: 'mcp:deploy-readiness',
});

const identityPayload = {
  subject_id: 'agent-being-evaluated',
  actor_id: 'authenticated-runtime-host',
  active: true,
  satpVerified: true,
  trustScore: 88,
  capabilities: ['mcp:deploy-readiness'],
  evidenceUpdatedAt: '2026-08-11T11:50:00Z',
  actor_evidence: {
    verifier_id: 'host-session-verifier',
    verified: true,
    revoked: false,
    actor_id: 'authenticated-runtime-host',
    subject_id: 'agent-being-evaluated',
    issued_at: '2026-08-11T11:55:00Z',
    expires_at: '2026-08-11T12:05:00Z',
    delegation_depth: 1,
    action_binding: {
      action_id: 'invoke-42',
      type: 'mcp_protected_tool',
      operation: 'invoke',
      resource: 'mcp://protected/deploy-readiness',
    },
  },
};

const result = evaluateRuntimePolicy(identityPayload, action, {
  now: '2026-08-11T12:00:00Z',
});
~~~

The older single-principal `agentId` shape remains compatible, but it does not represent authenticated delegation. Hosts that know an actor must use the explicit fail-closed shape rather than copying caller-controlled fields into `actor_evidence`.

### Optional x402 settlement context

`x402_settlement` (or `x402Settlement`) is optional and local/off-chain. A settlement must be verifier-confirmed, fresh, and bound to its purpose (`action_payment` or `evidence_lookup`), actor, subject, action ID, resource, and sufficient amount. A mismatch is denied.

~~~js
const result = evaluateRuntimePolicy(identityPayload, paidAction, {
  now: '2026-08-11T12:00:00Z',
  x402_settlement: {
    settlement_id: 'settlement-7',
    verifier_id: 'x402-receipt-verifier',
    verified: true,
    status: 'settled',
    purpose: 'action_payment',
    actor_id: identityPayload.actor_id,
    subject_id: identityPayload.subject_id,
    action_id: paidAction.actionId,
    resource: paidAction.resource,
    amount_usd: paidAction.costUsd,
    settled_at: '2026-08-11T11:58:00Z',
  },
  operatorApproved: false,
});
~~~

A valid settlement requires a non-empty settlement ID and named verifier and can satisfy the payment-context check only. It always emits `X402_SETTLEMENT_IS_NOT_TASK_OUTCOME_PROOF` and `X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION`; it cannot make evidence fresh, prove task completion, grant a capability, or bypass protected-tool approval.

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

The abbreviated payload above is the compatibility form for a single principal; use the complete authenticated example above whenever an actor is present.

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

- IDENTITY_INACTIVE: the identity is disabled locally.
- SUBJECT_ID_MISSING / ACTOR_ID_MISSING: explicit actor mode is missing a required principal ID.
- ACTOR_EVIDENCE_MISSING / ACTOR_EVIDENCE_UNVERIFIED / ACTOR_EVIDENCE_REVOKED / ACTOR_EVIDENCE_STALE: authenticated-actor evidence failed closed.
- ACTOR_SUBJECT_MISMATCH / ACTION_CONTEXT_MISMATCH: verifier evidence is bound to different principals or an action.
- ACTOR_EVIDENCE_ACTION_UNBOUND: verifier evidence does not identify the action it authenticated.
- DELEGATION_CONTEXT_MISSING / DELEGATION_DEPTH_EXCEEDED: delegated execution lacks an acceptable depth.
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
- X402_SETTLEMENT_UNVERIFIED / X402_SETTLEMENT_CONTEXT_MISMATCH: optional settlement evidence is invalid or bound elsewhere.
- X402_SETTLEMENT_VERIFIED: optional settlement evidence passed its payment-context binding checks.
- X402_LOOKUP_SETTLEMENT_BOUND: settlement covers the optional evidence lookup, not the requested action.
- X402_SETTLEMENT_IS_NOT_TASK_OUTCOME_PROOF: settlement proves payment, never execution success.
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
evaluateRuntimePolicy(identity, {
  type: 'x402_endpoint',
  resource: 'https://api.example.test/reputation',
  operation: 'lookup',
  costUsd: 0.05,
}, {
  actionPaymentPreapproved: true,
  policy: { maxAutoSpendUsd: 0.01 },
});
~~~

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

Policy decisions remain local to the host. SATP identity and host-provided trust signals are inputs to local policy, not blanket authorization. x402 payment grants lookup or endpoint access only; it does not authorize the agent action, bypass protected-tool approval, or replace host policy.

## SATP repo integration

This PR integrates the adapter into @brainai/satp-client as packages/satp-client/src/runtime-policy-adapter.js and exports evaluateRuntimePolicy, buildRuntimePolicyActionDescriptor, buildRuntimePolicyAuditTrace, DECISIONS, REASON_CODES, DEFAULT_POLICY, RUNTIME_POLICY_HOST_ACTION_DESCRIPTOR_SCHEMA_VERSION, and RUNTIME_POLICY_AUDIT_TRACE_SCHEMA_VERSION from the package root. The package path is branch/PR-only for review; no npm publish or dist-tag change is part of this artifact.

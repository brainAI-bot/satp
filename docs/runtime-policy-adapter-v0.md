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

Host trust-score gate:

~~~js
evaluateRuntimePolicy({ ...identity, trustScore: 62 }, {
  type: 'host_trust_gate',
  minimumTrustScore: 80,
  allowDegraded: true,
});
~~~

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

## Security note

Policy decisions remain local to the host. SATP identity and host-provided trust signals are inputs to local policy, not blanket authorization. x402 payment grants lookup or endpoint access only; it does not authorize the agent action, bypass protected-tool approval, or replace host policy.

## SATP repo integration

This PR integrates the adapter into @brainai/satp-client as packages/satp-client/src/runtime-policy-adapter.js and exports evaluateRuntimePolicy, buildRuntimePolicyAuditTrace, DECISIONS, REASON_CODES, DEFAULT_POLICY, and RUNTIME_POLICY_AUDIT_TRACE_SCHEMA_VERSION from the package root. The package path is branch/PR-only for review; no npm publish or dist-tag change is part of this artifact.

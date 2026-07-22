'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DECISIONS,
  REASON_CODES,
  RUNTIME_POLICY_AUDIT_TRACE_SCHEMA_VERSION,
  RUNTIME_POLICY_HOST_ACTION_DESCRIPTOR_SCHEMA_VERSION,
  buildRuntimePolicyActionDescriptor,
  buildRuntimePolicyAuditTrace,
  evaluateRuntimePolicy,
} = require('./src');

const baseIdentity = {
  agentId: 'brainchain-test',
  active: true,
  satpVerified: true,
  agentFolioTrustScore: 85,
  capabilities: ['mcp:read', 'agentfolio:trust-read'],
  evidenceUpdatedAt: '2026-05-20T00:00:00Z',
};

test('allows verified identity with sufficient trust, capability, and fresh evidence', () => {
  const result = evaluateRuntimePolicy(
    baseIdentity,
    {
      type: 'mcp_protected_tool',
      resource: 'mcp://protected/read',
      operation: 'read',
      requiresCapability: 'mcp:read',
      requiresFreshEvidence: true,
    },
    { now: '2026-05-21T00:00:00Z' }
  );

  assert.equal(result.decision, DECISIONS.ALLOW);
  assert.ok(result.reasonCodes.includes(REASON_CODES.LOCAL_POLICY_ALLOW));
  assert.ok(result.reasonCodes.includes(REASON_CODES.EVIDENCE_FRESH));
});

test('builds an MCP protected-tool descriptor usable by the runtime adapter', () => {
  const action = buildRuntimePolicyActionDescriptor({
    type: 'mcp_protected_tool',
    resource: 'mcp://protected/readiness',
    capability: 'mcp:read',
  });

  assert.equal(action.schemaVersion, RUNTIME_POLICY_HOST_ACTION_DESCRIPTOR_SCHEMA_VERSION);
  assert.equal(action.operation, 'invoke');
  assert.equal(action.requiresCapability, 'mcp:read');
  assert.equal(action.requiresFreshEvidence, true);
  assert.equal(action.protectedTool, true);
  assert.equal(action.guardrails.writesSolanaState, false);

  const result = evaluateRuntimePolicy(baseIdentity, action, { now: '2026-05-21T00:00:00Z' });
  assert.equal(result.decision, DECISIONS.ALLOW);
});

test('builds an AgentFolio trust gate descriptor with degraded access path', () => {
  const action = buildRuntimePolicyActionDescriptor({
    type: 'agentfolio_trust_gate',
    profileId: 'brainchain-demo',
    minimumTrustScore: 90,
  });

  assert.equal(action.resource, 'https://agentfolio.bot/api/profile/brainchain-demo/trust-score');
  assert.equal(action.operation, 'trust-score-read');
  assert.equal(action.requiresCapability, 'agentfolio:trust-read');
  assert.equal(action.allowDegraded, true);
  assert.equal(action.requiresFreshEvidence, true);

  const result = evaluateRuntimePolicy(
    baseIdentity,
    action,
    { now: '2026-05-21T00:00:00Z' }
  );

  assert.equal(result.decision, DECISIONS.DEGRADE);
  assert.ok(result.reasonCodes.includes(REASON_CODES.TRUST_SCORE_BELOW_MINIMUM));
});

test('builds an x402 endpoint descriptor without authorizing payment or action', () => {
  const action = buildRuntimePolicyActionDescriptor('x402_endpoint', {
    resource: 'https://api.example.test/reputation',
    costUsd: 0.05,
  });

  assert.equal(action.operation, 'lookup');
  assert.equal(action.protectedTool, false);
  assert.equal(action.guardrails.livePaymentRequired, false);

  const result = evaluateRuntimePolicy(baseIdentity, action, {
    now: '2026-05-21T00:00:00Z',
    policy: { maxAutoSpendUsd: 0.01 },
  });

  assert.equal(result.decision, DECISIONS.NEEDS_APPROVAL);
  assert.ok(result.reasonCodes.includes(REASON_CODES.ACTION_PAYMENT_NEEDS_APPROVAL));
});

test('denies inactive identities before checking action details', () => {
  const result = evaluateRuntimePolicy(
    { ...baseIdentity, active: false },
    { type: 'mcp_protected_tool', requiresCapability: 'mcp:read' }
  );

  assert.equal(result.decision, DECISIONS.DENY);
  assert.deepEqual(result.reasonCodes, [REASON_CODES.IDENTITY_INACTIVE]);
});

test('degrades when trust score is below action minimum and degraded mode is allowed', () => {
  const result = evaluateRuntimePolicy(
    { ...baseIdentity, agentFolioTrustScore: 55 },
    {
      type: 'agentfolio_trust_gate',
      minimumTrustScore: 75,
      allowDegraded: true,
    }
  );

  assert.equal(result.decision, DECISIONS.DEGRADE);
  assert.ok(result.reasonCodes.includes(REASON_CODES.TRUST_SCORE_BELOW_MINIMUM));
});

test('needs approval for stale evidence with an unpaid x402 lookup path', () => {
  const result = evaluateRuntimePolicy(
    { ...baseIdentity, evidenceUpdatedAt: '2026-04-01T00:00:00Z' },
    {
      type: 'mcp_protected_tool',
      requiresFreshEvidence: true,
      evidenceLookup: {
        type: 'x402',
        endpoint: 'https://api.example.test/evidence',
        maxCostUsd: 0.05,
      },
    },
    { now: '2026-05-21T00:00:00Z' }
  );

  assert.equal(result.decision, DECISIONS.NEEDS_APPROVAL);
  assert.ok(result.reasonCodes.includes(REASON_CODES.EVIDENCE_STALE_OR_MISSING));
  assert.ok(result.reasonCodes.includes(REASON_CODES.X402_LOOKUP_REQUIRES_APPROVAL));
  assert.ok(result.reasonCodes.includes(REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION));
});

test('treats future-dated evidence as stale instead of fresh', () => {
  const result = evaluateRuntimePolicy(
    { ...baseIdentity, evidenceUpdatedAt: '2026-05-22T00:00:01Z' },
    {
      type: 'mcp_protected_tool',
      requiresCapability: 'mcp:read',
      requiresFreshEvidence: true,
    },
    { now: '2026-05-22T00:00:00Z' }
  );

  assert.equal(result.decision, DECISIONS.DEGRADE);
  assert.equal(result.checks.evidenceFresh, false);
  assert.ok(result.reasonCodes.includes(REASON_CODES.EVIDENCE_STALE_OR_MISSING));
  assert.ok(!result.reasonCodes.includes(REASON_CODES.EVIDENCE_FRESH));
  assert.ok(!result.reasonCodes.includes(REASON_CODES.LOCAL_POLICY_ALLOW));
});

test('denies invalid action costUsd values instead of normalizing them to zero', () => {
  const invalidCosts = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '0.01',
    'not-a-number',
  ];

  for (const costUsd of invalidCosts) {
    const result = evaluateRuntimePolicy(
      baseIdentity,
      {
        type: 'mcp_protected_tool',
        requiresCapability: 'mcp:read',
        costUsd,
      },
      { now: '2026-05-21T00:00:00Z' }
    );

    assert.equal(result.decision, DECISIONS.DENY);
    assert.equal(result.checks.actionCostUsd, null);
    assert.equal(result.checks.actionCostUsdValid, false);
    assert.ok(result.reasonCodes.includes(REASON_CODES.INVALID_ACTION_COST_USD));
    assert.ok(!result.reasonCodes.includes(REASON_CODES.LOCAL_POLICY_ALLOW));
  }
});

test('builds a redacted runtime policy audit trace for host logs', () => {
  const identity = {
    ...baseIdentity,
    secretToken: 'super-secret-token',
    capabilities: ['mcp:read', 'agentfolio:trust-read', 'satp:private-write'],
  };
  const action = {
    type: 'mcp_protected_tool',
    resource: 'https://api.example.test/private?token=leak',
    operation: 'prepare',
    requiresCapability: 'mcp:read',
    requiresFreshEvidence: true,
    evidenceLookup: {
      type: 'x402',
      endpoint: 'https://paid.example.test/evidence?api_key=leak',
      maxCostUsd: 0.05,
    },
  };

  const trace = buildRuntimePolicyAuditTrace(identity, action, {
    now: '2026-05-21T00:00:00Z',
  });

  assert.equal(trace.schemaVersion, RUNTIME_POLICY_AUDIT_TRACE_SCHEMA_VERSION);
  assert.equal(trace.mode, 'offline-local-runtime-policy-trace');
  assert.equal(trace.generatedAt, '2026-05-21T00:00:00.000Z');
  assert.equal(trace.decision, DECISIONS.ALLOW);
  assert.equal(trace.subject.agentId, 'brainchain-test');
  assert.equal(trace.subject.trustScoreBand, '80-89');
  assert.equal(trace.subject.capabilityCount, 3);
  assert.deepEqual(trace.action.evidenceLookup, {
    type: 'x402',
    configured: true,
    maxCostUsd: 0.05,
  });
  assert.equal(trace.action.resourceKind, 'https:');
  assert.equal(trace.guardrails.writesSolanaState, false);
  assert.equal(trace.guardrails.usesKeypairs, false);
  assert.equal(trace.guardrails.publishesPackages, false);

  const serialized = JSON.stringify(trace);
  assert.ok(!serialized.includes('super-secret-token'));
  assert.ok(!serialized.includes('token=leak'));
  assert.ok(!serialized.includes('api_key=leak'));
  assert.ok(!serialized.includes('satp:private-write'));
});

test('redacts x402 lookup endpoints from audit trace checks', () => {
  const trace = buildRuntimePolicyAuditTrace(
    { ...baseIdentity, evidenceUpdatedAt: '2026-04-01T00:00:00Z' },
    {
      type: 'mcp_protected_tool',
      requiresFreshEvidence: true,
      evidenceLookup: {
        type: 'x402',
        endpoint: 'https://paid.example.test/evidence?api_key=leak',
        maxCostUsd: 0.05,
      },
    },
    { now: '2026-05-21T00:00:00Z' }
  );

  assert.equal(trace.decision, DECISIONS.NEEDS_APPROVAL);
  assert.deepEqual(trace.action.evidenceLookup, {
    type: 'x402',
    configured: true,
    maxCostUsd: 0.05,
  });
  assert.deepEqual(trace.checks.evidenceLookup, {
    type: 'x402',
    configured: true,
    maxCostUsd: 0.05,
  });
  assert.ok(!JSON.stringify(trace).includes('api_key=leak'));
});

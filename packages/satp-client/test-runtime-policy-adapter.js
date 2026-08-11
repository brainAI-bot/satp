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
  createRuntimePolicyAdapter,
  evaluateRuntimePolicy,
  evaluateRuntimePolicyContext,
} = require('./src');

const baseIdentity = {
  agentId: 'brainchain-test',
  active: true,
  satpVerified: true,
  agentFolioTrustScore: 85,
  capabilities: ['mcp:read', 'agentfolio:trust-read'],
  evidenceUpdatedAt: '2026-05-20T00:00:00Z',
};

const baseAuthenticatedContext = {
  subject_id: 'agentfolio-subject-42',
  subject: {
    active: true,
    satpVerified: true,
    trustScore: 88,
    evidenceUpdatedAt: '2026-05-21T00:00:00Z',
  },
  actor_id: 'mcp-runtime-7',
  actor: {
    actor_id: 'mcp-runtime-7',
    capabilities: ['mcp:caller-asserted-capability-is-ignored'],
  },
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
    capabilities: ['mcp:read', 'agentfolio:trust-read'],
  },
  action: {
    action_id: 'action-read-1',
    type: 'mcp_protected_tool',
    resource: 'mcp://protected/read',
    requiresCapability: 'mcp:read',
    requiresFreshEvidence: true,
  },
};

function authenticatedContext(overrides = {}) {
  const context = structuredClone(baseAuthenticatedContext);
  for (const key of ['subject', 'actor', 'actor_evidence', 'action', 'x402']) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      context[key] = overrides[key] === null
        ? null
        : { ...(context[key] || {}), ...overrides[key] };
    }
  }
  for (const key of ['subject_id', 'actor_id']) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) context[key] = overrides[key];
  }
  return context;
}

const authenticatedNow = { now: '2026-05-21T00:05:00Z' };

test('allows a distinct subject and actor only with verifier-produced actor evidence', () => {
  const result = evaluateRuntimePolicyContext(baseAuthenticatedContext, authenticatedNow);

  assert.notEqual(baseAuthenticatedContext.subject_id, baseAuthenticatedContext.actor_id);
  assert.equal(result.decision, DECISIONS.ALLOW);
  assert.ok(result.reasonCodes.includes(REASON_CODES.ACTOR_EVIDENCE_VERIFIED));
  assert.ok(result.reasonCodes.includes(REASON_CODES.DELEGATION_DEPTH_OK));
  assert.ok(result.reasonCodes.includes(REASON_CODES.LOCAL_POLICY_ALLOW));
});

test('does not treat caller-supplied actor context as authenticated evidence', () => {
  const context = authenticatedContext({ actor_evidence: null });
  const result = evaluateRuntimePolicyContext(context, authenticatedNow);

  assert.equal(result.decision, DECISIONS.NEEDS_APPROVAL);
  assert.deepEqual(result.reasonCodes, [REASON_CODES.ACTOR_EVIDENCE_MISSING]);
});

test('requires explicit subject, actor, and action identifiers', () => {
  const cases = [
    [authenticatedContext({ subject_id: '' }), REASON_CODES.SUBJECT_ID_MISSING],
    [authenticatedContext({ actor_id: '', actor: { actor_id: '' } }), REASON_CODES.ACTOR_ID_MISSING],
    [authenticatedContext({ action: { action_id: '' } }), REASON_CODES.ACTION_ID_MISSING],
  ];

  for (const [context, reasonCode] of cases) {
    const result = evaluateRuntimePolicyContext(context, authenticatedNow);
    assert.equal(result.decision, DECISIONS.DENY);
    assert.deepEqual(result.reasonCodes, [reasonCode]);
  }
});

test('denies unverified, revoked, and mismatched actor evidence with stable reason codes', () => {
  const cases = [
    [{ authenticated: false }, REASON_CODES.ACTOR_EVIDENCE_UNVERIFIED],
    [{ revoked: true }, REASON_CODES.ACTOR_EVIDENCE_REVOKED],
    [{ actor_id: 'different-actor' }, REASON_CODES.ACTOR_EVIDENCE_ACTOR_MISMATCH],
    [{ subject_id: 'different-subject' }, REASON_CODES.ACTOR_EVIDENCE_SUBJECT_MISMATCH],
    [{ action_id: 'different-action' }, REASON_CODES.ACTION_CONTEXT_MISMATCH],
  ];

  for (const [actorEvidence, reasonCode] of cases) {
    const result = evaluateRuntimePolicyContext(
      authenticatedContext({ actor_evidence: actorEvidence }),
      authenticatedNow
    );
    assert.equal(result.decision, DECISIONS.DENY);
    assert.ok(result.reasonCodes.includes(reasonCode));
  }
});

test('requires approval for stale actor evidence and denies excessive delegation depth', () => {
  const stale = evaluateRuntimePolicyContext(
    authenticatedContext({ actor_evidence: { verified_at: '2026-05-20T00:00:00Z' } }),
    authenticatedNow
  );
  assert.equal(stale.decision, DECISIONS.NEEDS_APPROVAL);
  assert.ok(stale.reasonCodes.includes(REASON_CODES.ACTOR_EVIDENCE_STALE));

  const deepDelegation = evaluateRuntimePolicyContext(
    authenticatedContext({ actor_evidence: { delegation_depth: 2 } }),
    authenticatedNow
  );
  assert.equal(deepDelegation.decision, DECISIONS.DENY);
  assert.ok(deepDelegation.reasonCodes.includes(REASON_CODES.DELEGATION_DEPTH_EXCEEDED));
});

test('binds optional x402 lookup and settlement context to subject, actor, and action', () => {
  const binding = {
    subject_id: baseAuthenticatedContext.subject_id,
    actor_id: baseAuthenticatedContext.actor_id,
    action_id: baseAuthenticatedContext.action.action_id,
    resource: baseAuthenticatedContext.action.resource,
  };
  const lookupMismatch = evaluateRuntimePolicyContext(
    authenticatedContext({ x402: { lookup: { ...binding, actor_id: 'different-actor' } } }),
    authenticatedNow
  );
  assert.equal(lookupMismatch.decision, DECISIONS.DENY);
  assert.ok(lookupMismatch.reasonCodes.includes(REASON_CODES.X402_LOOKUP_CONTEXT_MISMATCH));

  const settlementMismatch = evaluateRuntimePolicyContext(
    authenticatedContext({ x402: { settlement: { ...binding, action_id: 'different-action', status: 'settled' } } }),
    authenticatedNow
  );
  assert.equal(settlementMismatch.decision, DECISIONS.DENY);
  assert.ok(settlementMismatch.reasonCodes.includes(REASON_CODES.X402_SETTLEMENT_CONTEXT_MISMATCH));
});

test('treats x402 settlement as payment evidence, never task outcome or action authorization', () => {
  const action = {
    ...baseAuthenticatedContext.action,
    type: 'x402_endpoint',
    operation: 'lookup',
    costUsd: 0.01,
    requiresCapability: 'mcp:read',
  };
  const binding = {
    subject_id: baseAuthenticatedContext.subject_id,
    actor_id: baseAuthenticatedContext.actor_id,
    action_id: action.action_id,
    resource: action.resource,
  };

  const unverified = evaluateRuntimePolicyContext(
    authenticatedContext({ action, x402: { settlement: { ...binding, status: 'pending' } } }),
    authenticatedNow
  );
  assert.equal(unverified.decision, DECISIONS.NEEDS_APPROVAL);
  assert.ok(unverified.reasonCodes.includes(REASON_CODES.X402_SETTLEMENT_UNVERIFIED));

  const settled = evaluateRuntimePolicyContext(
    authenticatedContext({
      action,
      x402: { settlement: { ...binding, status: 'settled', verified_by: 'x402-host-verifier' } },
    }),
    authenticatedNow
  );
  assert.equal(settled.decision, DECISIONS.ALLOW);
  assert.equal(settled.checks.taskOutcomeProvenBySettlement, false);
  assert.ok(settled.reasonCodes.includes(REASON_CODES.X402_SETTLEMENT_NOT_TASK_OUTCOME_PROOF));
  assert.ok(settled.reasonCodes.includes(REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION));
});

test('authenticated context API exposes all stable decision outcomes', () => {
  const outcomes = [
    evaluateRuntimePolicyContext(baseAuthenticatedContext, authenticatedNow).decision,
    evaluateRuntimePolicyContext(authenticatedContext({ actor_evidence: { revoked: true } }), authenticatedNow).decision,
    evaluateRuntimePolicyContext(authenticatedContext({ subject: { trustScore: 60 }, action: { allowDegraded: true, minimumTrustScore: 80 } }), authenticatedNow).decision,
    evaluateRuntimePolicyContext(authenticatedContext({ actor_evidence: null }), authenticatedNow).decision,
  ];
  assert.deepEqual(new Set(outcomes), new Set(Object.values(DECISIONS)));
});

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
    action_id: 'mcp-readiness-1',
    type: 'mcp_protected_tool',
    resource: 'mcp://protected/readiness',
    capability: 'mcp:read',
  });

  assert.equal(action.schemaVersion, RUNTIME_POLICY_HOST_ACTION_DESCRIPTOR_SCHEMA_VERSION);
  assert.equal(action.action_id, 'mcp-readiness-1');
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

test('treats host trust-score gates as AgentFolio trust-score reads', () => {
  const action = buildRuntimePolicyActionDescriptor({
    type: 'host_trust_gate',
    profileId: 'brainchain-demo',
    minimumTrustScore: 80,
  });

  assert.equal(action.resource, 'https://agentfolio.bot/api/profile/brainchain-demo/trust-score');
  assert.equal(action.operation, 'trust-score-read');
  assert.equal(action.requiresCapability, 'agentfolio:trust-read');
  assert.equal(action.allowDegraded, true);
  assert.equal(action.requiresFreshEvidence, true);

  const result = evaluateRuntimePolicy(
    { ...baseIdentity, agentFolioTrustScore: 74 },
    action,
    { now: '2026-05-21T00:00:00Z' }
  );

  assert.equal(result.decision, DECISIONS.DEGRADE);
  assert.ok(result.reasonCodes.includes(REASON_CODES.TRUST_SCORE_BELOW_MINIMUM));
});

test('covers runtime adapter allow, deny, degrade, and needs_approval outcomes', () => {
  const outcomes = [
    evaluateRuntimePolicy(
      baseIdentity,
      {
        type: 'mcp_protected_tool',
        requiresCapability: 'mcp:read',
      },
      { now: '2026-05-21T00:00:00Z' }
    ).decision,
    evaluateRuntimePolicy(
      { ...baseIdentity, active: false },
      {
        type: 'mcp_protected_tool',
        requiresCapability: 'mcp:read',
      },
      { now: '2026-05-21T00:00:00Z' }
    ).decision,
    evaluateRuntimePolicy(
      { ...baseIdentity, agentFolioTrustScore: 60 },
      {
        type: 'host_trust_gate',
        minimumTrustScore: 80,
        allowDegraded: true,
      },
      { now: '2026-05-21T00:00:00Z' }
    ).decision,
    evaluateRuntimePolicy(
      baseIdentity,
      {
        type: 'mcp_protected_tool',
        requiresCapability: 'mcp:read',
        protectedTool: true,
        operatorApprovalRequired: true,
      },
      { now: '2026-05-21T00:00:00Z' }
    ).decision,
  ];

  assert.deepEqual(new Set(outcomes), new Set([
    DECISIONS.ALLOW,
    DECISIONS.DENY,
    DECISIONS.DEGRADE,
    DECISIONS.NEEDS_APPROVAL,
  ]));
});

test('creates a host-oriented runtime policy adapter with default action type and policy', () => {
  const adapter = createRuntimePolicyAdapter({
    defaultActionType: 'mcp_protected_tool',
    now: () => '2026-05-21T00:00:00Z',
    policy: {
      minimumTrustScore: 80,
      maxAutoSpendUsd: 0,
    },
  });

  const action = adapter.action({
    resource: 'mcp://protected/readiness',
    capability: 'mcp:read',
    operatorApprovalRequired: true,
  });

  assert.equal(action.type, 'mcp_protected_tool');
  assert.equal(action.operation, 'invoke');
  assert.equal(action.requiresFreshEvidence, true);

  const needsApproval = adapter.evaluate(baseIdentity, action);
  assert.equal(needsApproval.decision, DECISIONS.NEEDS_APPROVAL);
  assert.ok(needsApproval.reasonCodes.includes(REASON_CODES.PROTECTED_TOOL_REQUIRES_APPROVAL));

  const allowed = adapter.evaluate(baseIdentity, action, { operatorApproved: true });
  assert.equal(allowed.decision, DECISIONS.ALLOW);
  assert.ok(adapter.explain(allowed).includes('The local host policy allows the action.'));
});

test('runtime policy adapter emits redacted audit traces without changing evaluation input', () => {
  const adapter = createRuntimePolicyAdapter({
    now: '2026-05-21T00:00:00Z',
    redact: () => 'redacted private API endpoint',
  });
  const action = adapter.action({
    type: 'mcp_protected_tool',
    resource: 'https://api.example.test/private?token=leak',
    capability: 'mcp:read',
  });
  const result = adapter.evaluate(baseIdentity, action);
  const trace = adapter.auditTrace(baseIdentity, action, { result });

  assert.equal(result.decision, DECISIONS.ALLOW);
  assert.equal(trace.generatedAt, '2026-05-21T00:00:00.000Z');
  assert.equal(trace.action.resourceKind, 'https:');
  assert.equal(trace.action.resourceLabel, 'redacted private API endpoint');
  assert.ok(!JSON.stringify(trace).includes('token=leak'));
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

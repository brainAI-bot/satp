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
} = require('./src');

const baseIdentity = {
  agentId: 'brainchain-test',
  active: true,
  satpVerified: true,
  agentFolioTrustScore: 85,
  capabilities: ['mcp:read', 'agentfolio:trust-read'],
  evidenceUpdatedAt: '2026-05-20T00:00:00Z',
};

const AUTH_NOW = '2026-08-11T12:00:00Z';

function authenticatedContext(action, overrides = {}) {
  const subjectId = overrides.subject_id || 'subject-agent';
  const actorId = overrides.actor_id || 'runtime-host';
  return {
    active: true,
    satpVerified: true,
    trustScore: 88,
    capabilities: ['mcp:read', 'agentfolio:trust-read'],
    evidenceUpdatedAt: '2026-08-11T11:50:00Z',
    subject_id: subjectId,
    actor_id: actorId,
    ...overrides,
    actor_evidence: {
      verifier_id: 'runtime-auth-verifier',
      verified: true,
      revoked: false,
      actor_id: actorId,
      subject_id: subjectId,
      issued_at: '2026-08-11T11:55:00Z',
      expires_at: '2026-08-11T12:05:00Z',
      delegation_depth: actorId === subjectId ? 0 : 1,
      action_binding: {
        action_id: action.actionId,
        type: action.type,
        operation: action.operation,
        resource: action.resource,
      },
      ...(overrides.actor_evidence || {}),
    },
  };
}

function authenticatedAction(overrides = {}) {
  return buildRuntimePolicyActionDescriptor({
    action_id: 'action-001',
    type: 'mcp_protected_tool',
    resource: 'mcp://protected/read',
    operation: 'invoke',
    capability: 'mcp:read',
    requiresFreshEvidence: true,
    ...overrides,
  });
}

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

test('caller-supplied actor context alone needs approval because it is not authentication', () => {
  const action = authenticatedAction();
  const context = authenticatedContext(action);
  delete context.actor_evidence;

  const result = evaluateRuntimePolicy(context, action, { now: AUTH_NOW });

  assert.equal(result.decision, DECISIONS.NEEDS_APPROVAL);
  assert.ok(result.reasonCodes.includes(REASON_CODES.ACTOR_EVIDENCE_MISSING));
  assert.ok(!result.reasonCodes.includes(REASON_CODES.LOCAL_POLICY_ALLOW));
});

test('authenticated actor path covers allow, deny, degrade, and needs_approval', () => {
  const allowAction = authenticatedAction();
  const denyAction = authenticatedAction({ action_id: 'action-deny' });
  const degradeAction = authenticatedAction({ action_id: 'action-degrade', minimumTrustScore: 90, allowDegraded: true });
  const approvalAction = authenticatedAction({ action_id: 'action-approval', operatorApprovalRequired: true });

  const results = [
    evaluateRuntimePolicy(authenticatedContext(allowAction), allowAction, { now: AUTH_NOW }),
    evaluateRuntimePolicy(authenticatedContext(denyAction, {
      actor_evidence: { revoked: true },
    }), denyAction, { now: AUTH_NOW }),
    evaluateRuntimePolicy(authenticatedContext(degradeAction, { trustScore: 60 }), degradeAction, { now: AUTH_NOW }),
    evaluateRuntimePolicy(authenticatedContext(approvalAction), approvalAction, { now: AUTH_NOW }),
  ];

  assert.deepEqual(results.map((result) => result.decision), [
    DECISIONS.ALLOW,
    DECISIONS.DENY,
    DECISIONS.DEGRADE,
    DECISIONS.NEEDS_APPROVAL,
  ]);
});

test('fails closed for stale, missing, and revoked verifier-produced actor evidence', () => {
  const action = authenticatedAction();
  const missing = authenticatedContext(action);
  delete missing.actor_evidence;
  const stale = authenticatedContext(action, {
    actor_evidence: { issued_at: '2026-08-11T11:00:00Z', expires_at: '2026-08-11T11:30:00Z' },
  });
  const revoked = authenticatedContext(action, { actor_evidence: { revoked: true } });

  const missingResult = evaluateRuntimePolicy(missing, action, { now: AUTH_NOW });
  const staleResult = evaluateRuntimePolicy(stale, action, { now: AUTH_NOW });
  const revokedResult = evaluateRuntimePolicy(revoked, action, { now: AUTH_NOW });

  assert.equal(missingResult.decision, DECISIONS.NEEDS_APPROVAL);
  assert.ok(missingResult.reasonCodes.includes(REASON_CODES.ACTOR_EVIDENCE_MISSING));
  assert.equal(staleResult.decision, DECISIONS.NEEDS_APPROVAL);
  assert.ok(staleResult.reasonCodes.includes(REASON_CODES.ACTOR_EVIDENCE_STALE));
  assert.equal(revokedResult.decision, DECISIONS.DENY);
  assert.ok(revokedResult.reasonCodes.includes(REASON_CODES.ACTOR_EVIDENCE_REVOKED));
});

test('fails closed for unnamed actor evidence and invalid evaluation time', () => {
  const action = authenticatedAction();
  const unnamed = authenticatedContext(action, { actor_evidence: { verifier_id: '   ' } });
  const valid = authenticatedContext(action);

  const unnamedResult = evaluateRuntimePolicy(unnamed, action, { now: AUTH_NOW });
  const invalidTimeResult = evaluateRuntimePolicy(valid, action, { now: 'not-a-date' });

  assert.equal(unnamedResult.decision, DECISIONS.DENY);
  assert.ok(unnamedResult.reasonCodes.includes(REASON_CODES.ACTOR_EVIDENCE_UNVERIFIED));
  assert.equal(invalidTimeResult.decision, DECISIONS.NEEDS_APPROVAL);
  assert.ok(invalidTimeResult.reasonCodes.includes(REASON_CODES.ACTOR_EVIDENCE_STALE));
});

test('denies mismatched action bindings and delegation beyond the local limit', () => {
  const action = authenticatedAction();
  const mismatched = authenticatedContext(action, {
    actor_evidence: {
      action_binding: {
        action_id: 'different-action',
        type: action.type,
        operation: action.operation,
        resource: action.resource,
      },
    },
  });
  const tooDeep = authenticatedContext(action, { actor_evidence: { delegation_depth: 2 } });

  const mismatchResult = evaluateRuntimePolicy(mismatched, action, { now: AUTH_NOW });
  const depthResult = evaluateRuntimePolicy(tooDeep, action, { now: AUTH_NOW });

  assert.equal(mismatchResult.decision, DECISIONS.DENY);
  assert.ok(mismatchResult.reasonCodes.includes(REASON_CODES.ACTION_CONTEXT_MISMATCH));
  assert.equal(depthResult.decision, DECISIONS.DENY);
  assert.ok(depthResult.reasonCodes.includes(REASON_CODES.DELEGATION_DEPTH_EXCEEDED));
});

test('denies partial actor evidence bindings that do not identify the exact action', () => {
  const action = authenticatedAction();
  const context = authenticatedContext(action, {
    actor_evidence: {
      action_binding: { type: action.type },
    },
  });

  const result = evaluateRuntimePolicy(context, action, { now: AUTH_NOW });

  assert.equal(result.decision, DECISIONS.DENY);
  assert.ok(result.reasonCodes.includes(REASON_CODES.ACTION_CONTEXT_MISMATCH));
});

test('binds x402 settlement to payment context without treating it as task outcome or tool approval', () => {
  const action = authenticatedAction({
    action_id: 'paid-action',
    type: 'x402_endpoint',
    resource: 'https://api.example.test/reputation',
    operation: 'lookup',
    costUsd: 0.01,
    operatorApprovalRequired: true,
    protectedTool: true,
  });
  const context = authenticatedContext(action);
  const settlement = {
    settlement_id: 'settlement-001',
    verifier_id: 'x402-receipt-verifier',
    verified: true,
    status: 'settled',
    purpose: 'action_payment',
    actor_id: context.actor_id,
    subject_id: context.subject_id,
    action_id: action.actionId,
    resource: action.resource,
    amount_usd: 0.01,
    settled_at: '2026-08-11T11:58:00Z',
    task_outcome: 'success',
  };

  const mismatch = evaluateRuntimePolicy(context, action, {
    now: AUTH_NOW,
    x402Settlement: { ...settlement, action_id: 'different-action' },
  });
  assert.equal(mismatch.decision, DECISIONS.DENY);
  assert.ok(mismatch.reasonCodes.includes(REASON_CODES.X402_SETTLEMENT_CONTEXT_MISMATCH));

  const stillNeedsApproval = evaluateRuntimePolicy(context, action, { now: AUTH_NOW, x402Settlement: settlement });
  assert.equal(stillNeedsApproval.decision, DECISIONS.NEEDS_APPROVAL);
  assert.ok(stillNeedsApproval.reasonCodes.includes(REASON_CODES.X402_SETTLEMENT_VERIFIED));
  assert.ok(stillNeedsApproval.reasonCodes.includes(REASON_CODES.X402_SETTLEMENT_IS_NOT_TASK_OUTCOME_PROOF));
  assert.ok(stillNeedsApproval.reasonCodes.includes(REASON_CODES.PROTECTED_TOOL_REQUIRES_APPROVAL));

  const allowed = evaluateRuntimePolicy(context, action, {
    now: AUTH_NOW,
    x402Settlement: settlement,
    operatorApproved: true,
  });
  assert.equal(allowed.decision, DECISIONS.ALLOW);
});

test('binds optional x402 lookup settlement but remains degraded until refreshed evidence is verified', () => {
  const action = authenticatedAction({
    action_id: 'lookup-action',
    evidenceLookup: {
      type: 'x402',
      endpoint: 'https://api.example.test/evidence',
      maxCostUsd: 0.05,
    },
  });
  const context = authenticatedContext(action, { evidenceUpdatedAt: null });
  const settlement = {
    settlement_id: 'settlement-lookup-001',
    verifier_id: 'x402-receipt-verifier',
    verified: true,
    status: 'settled',
    purpose: 'evidence_lookup',
    actor_id: context.actor_id,
    subject_id: context.subject_id,
    action_id: action.actionId,
    resource: action.evidenceLookup.endpoint,
    amount_usd: 0.05,
    settled_at: '2026-08-11T11:58:00Z',
  };

  const result = evaluateRuntimePolicy(context, action, { now: AUTH_NOW, x402_settlement: settlement });

  assert.equal(result.decision, DECISIONS.DEGRADE);
  assert.ok(result.reasonCodes.includes(REASON_CODES.EVIDENCE_STALE_OR_MISSING));
  assert.ok(result.reasonCodes.includes(REASON_CODES.X402_LOOKUP_SETTLEMENT_BOUND));
  assert.ok(result.reasonCodes.includes(REASON_CODES.X402_SETTLEMENT_IS_NOT_TASK_OUTCOME_PROOF));
  assert.ok(!result.reasonCodes.includes(REASON_CODES.LOCAL_POLICY_ALLOW));
});

test('denies caller-asserted x402 settlements without verifier provenance', () => {
  const action = authenticatedAction({
    action_id: 'unverified-paid-action',
    type: 'x402_endpoint',
    resource: 'https://api.example.test/reputation',
    operation: 'lookup',
    costUsd: 0.01,
  });
  const context = authenticatedContext(action);

  const result = evaluateRuntimePolicy(context, action, {
    now: AUTH_NOW,
    x402Settlement: {
      settlement_id: 'caller-asserted-settlement',
      verified: true,
      status: 'settled',
      purpose: 'action_payment',
      actor_id: context.actor_id,
      subject_id: context.subject_id,
      action_id: action.actionId,
      resource: action.resource,
      amount_usd: action.costUsd,
      settled_at: '2026-08-11T11:58:00Z',
    },
  });

  assert.equal(result.decision, DECISIONS.DENY);
  assert.ok(result.reasonCodes.includes(REASON_CODES.X402_SETTLEMENT_UNVERIFIED));
});

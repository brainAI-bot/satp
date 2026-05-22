'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DECISIONS,
  REASON_CODES,
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

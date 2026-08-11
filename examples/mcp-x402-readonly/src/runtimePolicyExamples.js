'use strict';

const {
  createRuntimePolicyAdapter,
} = require('../../../packages/satp-client/src');

const DEFAULT_NOW = '2026-05-21T00:00:00Z';
const DEFAULT_IDENTITY = Object.freeze({
  agentId: 'mcp-fixture-agent',
  active: true,
  satpVerified: true,
  trustScore: 88,
  capabilities: ['mcp:satp.getPrograms', 'mcp:satp.prepareAttestationRequest', 'satp:trust-read'],
  evidenceUpdatedAt: DEFAULT_NOW,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildAuthenticatedRuntimeContext({ identity, actorId, action, now, x402 }) {
  return {
    subject_id: identity.agentId,
    subject: clone(identity),
    actor_id: actorId,
    actor: { actor_id: actorId },
    actor_evidence: {
      verifier_id: 'satp-example-host-verifier',
      authenticated: true,
      verified_at: now,
      revoked: false,
      subject_id: identity.agentId,
      actor_id: actorId,
      action_id: action.action_id,
      delegation_depth: 0,
      capabilities: clone(identity.capabilities),
    },
    action,
    ...(x402 ? { x402 } : {}),
  };
}

function createExampleRuntimePolicyAdapter(options = {}) {
  return createRuntimePolicyAdapter({
    now: options.now || DEFAULT_NOW,
    policy: {
      minimumTrustScore: 70,
      denyTrustScoreBelow: 25,
      maxAutoSpendUsd: 0,
      requireVerifiedIdentity: true,
      staleEvidenceAfterMs: 7 * 24 * 60 * 60 * 1000,
      ...(options.policy || {}),
    },
    redact: () => 'redacted example resource',
  });
}

function buildMcpProtectedToolPolicyExample({
  identity = DEFAULT_IDENTITY,
  toolName = 'satp.getPrograms',
  operatorApproved = false,
  now = DEFAULT_NOW,
} = {}) {
  const adapter = createExampleRuntimePolicyAdapter({ now });
  const action = adapter.action({
    action_id: `mcp:${toolName}:invoke`,
    type: 'mcp_protected_tool',
    resource: `mcp://protected/${toolName}`,
    operation: 'invoke',
    capability: `mcp:${toolName}`,
    operatorApprovalRequired: true,
    requiresFreshEvidence: true,
  });
  const runtimeContext = buildAuthenticatedRuntimeContext({
    identity,
    actorId: 'mcp-example-runtime',
    action,
    now,
  });
  const result = adapter.evaluateContext(runtimeContext, { operatorApproved });

  return {
    kind: 'satp.mcpProtectedToolRuntimePolicyExample.v1',
    mode: 'offline-local-runtime-policy',
    toolName,
    runtimeContext,
    action,
    result,
    auditTrace: adapter.auditTrace(identity, action, { result }),
    guardrails: {
      writesSolanaState: false,
      usesKeypairs: false,
      deploysPrograms: false,
      livePaymentRequired: false,
      authorizesAgentActionFromPayment: false,
    },
  };
}

function buildX402PaidEndpointPolicyExample({
  identity = DEFAULT_IDENTITY,
  endpoint = 'https://api.example.test/satp/reputation',
  actionPaymentPreapproved = false,
  now = DEFAULT_NOW,
} = {}) {
  const adapter = createExampleRuntimePolicyAdapter({ now });
  const action = adapter.action('x402_endpoint', {
    action_id: 'x402:reputation:lookup',
    resource: endpoint,
    operation: 'lookup',
    costUsd: 0.01,
    requiresFreshEvidence: true,
  });
  const actorId = 'x402-example-runtime';
  const runtimeContext = buildAuthenticatedRuntimeContext({
    identity,
    actorId,
    action,
    now,
    x402: actionPaymentPreapproved
      ? {
          settlement: {
            subject_id: identity.agentId,
            actor_id: actorId,
            action_id: action.action_id,
            resource: endpoint,
            settlement_id: 'fixture-settlement-001',
            status: 'settled',
            verified_by: 'x402-example-host-verifier',
          },
        }
      : undefined,
  });
  const result = adapter.evaluateContext(runtimeContext, {
    policy: { maxAutoSpendUsd: 0 },
  });

  return {
    kind: 'satp.x402PaidEndpointRuntimePolicyExample.v1',
    mode: 'offline-local-runtime-policy',
    endpointKind: 'x402-paid-reputation-lookup',
    runtimeContext,
    action,
    result,
    auditTrace: adapter.auditTrace(identity, action, { result }),
    paymentBoundary: {
      mockOnly: true,
      livePaymentRequired: false,
      spendAuthorized: actionPaymentPreapproved === true,
      paymentIsNotActionAuthorization: true,
      paymentIsNotTaskOutcomeProof: true,
    },
    guardrails: {
      writesSolanaState: false,
      usesKeypairs: false,
      deploysPrograms: false,
      livePaymentRequired: false,
      authorizesAgentActionFromPayment: false,
    },
  };
}

module.exports = {
  DEFAULT_IDENTITY,
  DEFAULT_NOW,
  createExampleRuntimePolicyAdapter,
  buildMcpProtectedToolPolicyExample,
  buildX402PaidEndpointPolicyExample,
};

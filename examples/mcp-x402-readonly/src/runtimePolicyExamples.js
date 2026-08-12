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

function bindVerifiedActorContext(identity, action, now = DEFAULT_NOW) {
  const subjectId = identity.subject_id || identity.subjectId || identity.agentId;
  const actorId = 'mcp-reference-host';
  return {
    ...clone(identity),
    subject_id: subjectId,
    actor_id: actorId,
    actor_evidence: {
      verifier_id: 'mcp-reference-auth-verifier',
      verified: true,
      revoked: false,
      actor_id: actorId,
      subject_id: subjectId,
      issued_at: now,
      delegation_depth: 1,
      action_binding: {
        action_id: action.actionId,
        type: action.type,
        operation: action.operation,
        resource: action.resource,
      },
    },
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
    action_id: `mcp:${toolName}:fixture`,
    type: 'mcp_protected_tool',
    resource: `mcp://protected/${toolName}`,
    operation: 'invoke',
    capability: `mcp:${toolName}`,
    operatorApprovalRequired: true,
    requiresFreshEvidence: true,
  });
  const actorContext = bindVerifiedActorContext(identity, action, now);
  const result = adapter.evaluate(actorContext, action, { operatorApproved });

  return {
    kind: 'satp.mcpProtectedToolRuntimePolicyExample.v1',
    mode: 'offline-local-runtime-policy',
    toolName,
    actorContext,
    action,
    result,
    auditTrace: adapter.auditTrace(actorContext, action, { result }),
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
    action_id: 'x402:reputation-lookup:fixture',
    resource: endpoint,
    operation: 'lookup',
    costUsd: 0.01,
    requiresFreshEvidence: true,
  });
  const actorContext = bindVerifiedActorContext(identity, action, now);
  const x402Settlement = actionPaymentPreapproved
    ? {
        settlement_id: 'x402-settlement-fixture',
        verifier_id: 'mcp-reference-x402-verifier',
        verified: true,
        status: 'settled',
        purpose: 'action_payment',
        actor_id: actorContext.actor_id,
        subject_id: actorContext.subject_id,
        action_id: action.actionId,
        resource: action.resource,
        amount_usd: action.costUsd,
        settled_at: now,
      }
    : null;
  const result = adapter.evaluate(actorContext, action, {
    x402Settlement,
    policy: { maxAutoSpendUsd: 0 },
  });

  return {
    kind: 'satp.x402PaidEndpointRuntimePolicyExample.v1',
    mode: 'offline-local-runtime-policy',
    endpointKind: 'x402-paid-reputation-lookup',
    actorContext,
    action,
    x402Settlement,
    result,
    auditTrace: adapter.auditTrace(actorContext, action, { result }),
    paymentBoundary: {
      mockOnly: true,
      livePaymentRequired: false,
      spendAuthorized: actionPaymentPreapproved === true,
      paymentIsNotActionAuthorization: true,
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
  bindVerifiedActorContext,
  buildMcpProtectedToolPolicyExample,
  buildX402PaidEndpointPolicyExample,
};

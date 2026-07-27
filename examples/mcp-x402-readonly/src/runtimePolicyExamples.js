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
    type: 'mcp_protected_tool',
    resource: `mcp://protected/${toolName}`,
    operation: 'invoke',
    capability: `mcp:${toolName}`,
    operatorApprovalRequired: true,
    requiresFreshEvidence: true,
  });
  const result = adapter.evaluate(clone(identity), action, { operatorApproved });

  return {
    kind: 'satp.mcpProtectedToolRuntimePolicyExample.v1',
    mode: 'offline-local-runtime-policy',
    toolName,
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
    resource: endpoint,
    operation: 'lookup',
    costUsd: 0.01,
    requiresFreshEvidence: true,
  });
  const result = adapter.evaluate(clone(identity), action, {
    actionPaymentPreapproved,
    policy: { maxAutoSpendUsd: 0 },
  });

  return {
    kind: 'satp.x402PaidEndpointRuntimePolicyExample.v1',
    mode: 'offline-local-runtime-policy',
    endpointKind: 'x402-paid-reputation-lookup',
    action,
    result,
    auditTrace: adapter.auditTrace(identity, action, { result }),
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
  buildMcpProtectedToolPolicyExample,
  buildX402PaidEndpointPolicyExample,
};

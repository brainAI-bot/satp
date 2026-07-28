#!/usr/bin/env node
'use strict';

const {
  buildRuntimePolicyActionDescriptor,
  buildRuntimePolicyAuditTrace,
  evaluateRuntimePolicy,
} = require('..');

const trustedIdentity = {
  agentId: 'brainchain-demo',
  active: true,
  satpVerified: true,
  trustScore: 88,
  capabilities: ['mcp:deploy-readiness', 'satp:trust-read', 'agentfolio:trust-read'],
  evidenceUpdatedAt: '2026-05-21T00:00:00Z',
};

const examples = [
  {
    name: 'MCP protected tool',
    identity: trustedIdentity,
    action: buildRuntimePolicyActionDescriptor({
      type: 'mcp_protected_tool',
      resource: 'mcp://protected/deploy-readiness',
      operation: 'read',
      capability: 'mcp:deploy-readiness',
    }),
    options: {
      now: '2026-05-21T00:00:00Z',
    },
  },
  {
    name: 'x402 paid endpoint',
    identity: trustedIdentity,
    action: buildRuntimePolicyActionDescriptor('x402_endpoint', {
      type: 'x402_endpoint',
      resource: 'https://api.example.test/reputation',
      costUsd: 0.05,
    }),
    options: {
      actionPaymentPreapproved: true,
      policy: { maxAutoSpendUsd: 0.01 },
    },
  },
  {
    name: 'AgentFolio trust-score degrade',
    identity: { ...trustedIdentity, trustScore: 62 },
    action: buildRuntimePolicyActionDescriptor({
      type: 'agentfolio_trust_gate',
      profileId: 'brainchain-demo',
      minimumTrustScore: 80,
    }),
    options: {
      now: '2026-05-21T00:00:00Z',
    },
  },
  {
    name: 'Host trust-score gate alias',
    identity: { ...trustedIdentity, trustScore: 74 },
    action: buildRuntimePolicyActionDescriptor({
      type: 'host_trust_gate',
      profileId: 'brainchain-demo',
      minimumTrustScore: 80,
    }),
    options: {
      now: '2026-05-21T00:00:00Z',
    },
  },
  {
    name: 'Optional paid x402 evidence lookup',
    identity: { ...trustedIdentity, evidenceUpdatedAt: '2026-04-01T00:00:00Z' },
    action: {
      type: 'mcp_protected_tool',
      resource: 'mcp://protected/high-risk-action',
      operation: 'prepare',
      requiresFreshEvidence: true,
      evidenceLookup: {
        type: 'x402',
        endpoint: 'https://api.example.test/evidence',
        maxCostUsd: 0.05,
      },
    },
    options: {
      now: '2026-05-21T00:00:00Z',
    },
  },
];

for (const item of examples) {
  const result = evaluateRuntimePolicy(item.identity, item.action, item.options);
  console.log(JSON.stringify({ name: item.name, ...result }, null, 2));
}

const auditTrace = buildRuntimePolicyAuditTrace(
  trustedIdentity,
  {
    type: 'mcp_protected_tool',
    resource: 'mcp://protected/deploy-readiness',
    operation: 'read',
    requiresCapability: 'mcp:deploy-readiness',
    requiresFreshEvidence: true,
  },
  { now: '2026-05-21T00:00:00Z' }
);

console.log(JSON.stringify({ name: 'Redacted audit trace', ...auditTrace }, null, 2));

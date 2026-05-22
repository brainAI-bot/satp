#!/usr/bin/env node
'use strict';

const { evaluateRuntimePolicy } = require('..');

const trustedIdentity = {
  agentId: 'brainchain-demo',
  active: true,
  satpVerified: true,
  agentFolioTrustScore: 88,
  capabilities: ['mcp:deploy-readiness', 'agentfolio:trust-read'],
  evidenceUpdatedAt: '2026-05-21T00:00:00Z',
};

const examples = [
  {
    name: 'MCP protected tool',
    identity: trustedIdentity,
    action: {
      type: 'mcp_protected_tool',
      resource: 'mcp://protected/deploy-readiness',
      operation: 'read',
      requiresCapability: 'mcp:deploy-readiness',
      requiresFreshEvidence: true,
    },
  },
  {
    name: 'x402 paid endpoint',
    identity: trustedIdentity,
    action: {
      type: 'x402_endpoint',
      resource: 'https://api.example.test/reputation',
      operation: 'lookup',
      costUsd: 0.05,
    },
    options: {
      actionPaymentPreapproved: true,
      policy: { maxAutoSpendUsd: 0.01 },
    },
  },
  {
    name: 'AgentFolio trust-score degrade',
    identity: { ...trustedIdentity, agentFolioTrustScore: 62 },
    action: {
      type: 'agentfolio_trust_gate',
      resource: 'agentfolio://trust-score',
      operation: 'gate',
      minimumTrustScore: 80,
      allowDegraded: true,
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

#!/usr/bin/env node
'use strict';

const {
  buildRuntimePolicyActionDescriptorFromX402Discovery,
  buildSatpTrustPacket,
  createRuntimePolicyAdapter,
  getV3ProgramIds,
  validateSatpTrustPacket,
} = require('../src');

const METADATA_HASH = '93d122f8879fe87c186c10a00db8fbc80a73cecd2ede44b9ffa6410be3c2b805';

async function mcpToolServerQuickstart() {
  function createSatpMcpTools() {
    return {
      'satp.getPrograms': async ({ network = 'devnet' } = {}) => ({
        network,
        programs: getV3ProgramIds(network),
        guardrails: {
          readOnly: true,
          writesSolanaState: false,
          usesKeypairs: false,
        },
      }),

      'satp.prepareAttestationRequest': async ({
        subjectWallet,
        agentId,
        claimType = 'identity',
        metadataHash,
        network = 'devnet',
      }) => {
        const packet = buildSatpTrustPacket({
          subjectWallet,
          agentId,
          claimType,
          metadataHash,
          network,
        });
        const validation = validateSatpTrustPacket(packet);
        if (!validation.ok) throw new Error(validation.errors.join('; '));

        return {
          packet,
          guardrails: {
            readOnly: true,
            livePaymentRequired: false,
            transaction: null,
          },
        };
      },
    };
  }

  const tools = createSatpMcpTools();
  const prepared = await tools['satp.prepareAttestationRequest']({
    subjectWallet: '11111111111111111111111111111111',
    agentId: 'example-mcp-agent',
    metadataHash: METADATA_HASH,
  });
  return {
    audience: 'mcp-tool-server-builders',
    mode: prepared.packet.mode,
    guardrails: prepared.guardrails,
  };
}

function agentRuntimeQuickstart() {
  const now = new Date().toISOString();
  const adapter = createRuntimePolicyAdapter({
    policy: {
      minimumTrustScore: 70,
      denyTrustScoreBelow: 25,
      requireVerifiedIdentity: true,
      maxAutoSpendUsd: 0,
    },
  });
  const identity = {
    agentId: 'partner-runtime-agent',
    active: true,
    satpVerified: true,
    trustScore: 82,
    capabilities: ['a2a:task.delegate'],
    evidenceUpdatedAt: now,
  };
  const action = adapter.action({
    type: 'a2a_agent_runtime',
    resource: 'a2a://task/delegate',
    operation: 'delegate',
    capability: 'a2a:task.delegate',
    requiresFreshEvidence: true,
    operatorApprovalRequired: false,
  });
  const result = adapter.evaluate(identity, action, { now });
  const auditTrace = adapter.auditTrace(identity, action, { result, now });

  return {
    audience: 'a2a-agent-runtime-builders',
    decision: result.decision,
    reasonCodes: result.reasonCodes,
    localDecisionOnly: auditTrace.guardrails.localDecisionOnly,
  };
}

function x402PaidEndpointQuickstart() {
  const discovery = {
    endpoint: 'https://api.example.test/satp/reputation',
    action: 'lookup',
    accepts: [{
      scheme: 'exact',
      network: 'solana-mainnet',
      asset: 'USDC',
      maxAmountRequired: '10000',
      resource: 'https://api.example.test/satp/reputation',
      description: 'SATP-backed reputation evidence lookup',
    }],
  };
  const lookupAction = buildRuntimePolicyActionDescriptorFromX402Discovery(
    discovery,
    { maxCostUsd: 0.01 }
  );
  const adapter = createRuntimePolicyAdapter({
    policy: { maxAutoSpendUsd: 0, minimumTrustScore: 70 },
  });
  const identity = {
    agentId: 'x402-consumer-agent',
    active: true,
    satpVerified: true,
    trustScore: 90,
    capabilities: ['satp:evidence.lookup'],
    evidenceUpdatedAt: '2026-05-21T00:00:00Z',
  };
  const result = adapter.evaluate(identity, lookupAction, {
    evidenceLookupPaymentPreapproved: false,
    now: '2026-07-31T00:00:00Z',
  });

  return {
    audience: 'x402-paid-endpoint-builders',
    decision: result.decision,
    reasonCodes: result.reasonCodes,
    guardrail: lookupAction.evidenceLookup.guardrail,
    paymentBoundary: {
      satpPackageUseIsFreeOpen: true,
      x402OnlyForHostedReputationEvidenceLookup: true,
      paymentIsNotActionAuthorization: true,
      livePaymentRequired: false,
    },
  };
}

async function run() {
  const examples = [
    await mcpToolServerQuickstart(),
    agentRuntimeQuickstart(),
    x402PaidEndpointQuickstart(),
  ];
  console.log(JSON.stringify({ examples }, null, 2));
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  agentRuntimeQuickstart,
  mcpToolServerQuickstart,
  x402PaidEndpointQuickstart,
};

'use strict';

const {
  createRuntimePolicyAdapter,
} = require('../../../packages/satp-client/src');
const {
  buildAgentFolioSatpConsumerRecord,
  verifyAgentFolioSatpConsumerRecord,
} = require('./consumerRecord');

const DEFAULT_NOW = '2026-05-21T00:00:00Z';

function buildAgentFolioRuntimePolicyReference({
  profile,
  trustScore = 86,
  evidenceUpdatedAt = DEFAULT_NOW,
  now = DEFAULT_NOW,
} = {}) {
  const record = buildAgentFolioSatpConsumerRecord({ profile });
  const verification = verifyAgentFolioSatpConsumerRecord(record);
  const adapter = createRuntimePolicyAdapter({
    defaultActionType: 'agentfolio_trust_gate',
    now,
    policy: {
      minimumTrustScore: 80,
      maxAutoSpendUsd: 0,
      requireVerifiedIdentity: true,
    },
  });
  const action = adapter.action({
    profileId: record.profile.profileId,
    minimumTrustScore: 80,
  });
  const identityPayload = {
    agentId: record.satp.agentId,
    active: verification.ok,
    satpVerified: verification.ok,
    trustScore,
    capabilities: ['agentfolio:trust-read'],
    evidenceUpdatedAt,
  };
  const result = adapter.evaluate(identityPayload, action);

  return {
    kind: 'agentfolio.satpRuntimePolicyReference.v1',
    mode: 'offline-local-reference-consumer-plan',
    recordVerified: verification.ok,
    verificationErrors: verification.errors,
    identityPayload,
    action,
    result,
    auditTrace: adapter.auditTrace(identityPayload, action, { result }),
    integrationPlan: [
      'Build or load an AgentFolio profile record from application-owned data.',
      'Verify the SATP trust packet and unsigned request metadata before displaying or queueing it.',
      'Create an agentfolio_trust_gate action with createRuntimePolicyAdapter.',
      'Apply the local allow, deny, degrade, or needs_approval decision before returning profile trust data.',
      'Keep any production deploy, live x402 payment, Solana write, npm publish, or keypair path in a separate approved task.',
    ],
    guardrails: {
      writesSolanaState: false,
      usesKeypairs: false,
      deploysPrograms: false,
      publishesPackages: false,
      livePaymentRequired: false,
      authorizesAgentActionFromPayment: false,
    },
  };
}

module.exports = {
  buildAgentFolioRuntimePolicyReference,
};

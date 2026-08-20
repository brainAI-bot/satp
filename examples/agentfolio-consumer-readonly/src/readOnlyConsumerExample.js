'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  buildAgentFolioSatpConsumerRecord,
  verifyAgentFolioSatpConsumerRecord,
} = require('./consumerRecord');
const {
  buildAgentFolioRuntimePolicyReference,
} = require('./runtimePolicyReference');

const DEFAULT_PROFILE_PATH = path.join(__dirname, '..', 'fixtures', 'agentfolio-profile.json');

function loadProfile(profilePath = DEFAULT_PROFILE_PATH) {
  const resolvedPath = path.resolve(profilePath);
  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

function buildAgentFolioReadOnlyView({ profile, network = 'devnet' } = {}) {
  const record = buildAgentFolioSatpConsumerRecord({ profile, network });
  const verification = verifyAgentFolioSatpConsumerRecord(record);
  if (!verification.ok) {
    throw new Error('SATP consumer record verification failed: ' + verification.errors.join('; '));
  }

  const policy = buildAgentFolioRuntimePolicyReference({ profile, network });

  return {
    schemaVersion: 'agentfolio.satpReadonlyConsumerExample.v1',
    mode: 'offline-readonly',
    profile: record.profile,
    satp: {
      network: record.network,
      agentId: record.satp.agentId,
      subjectWallet: record.satp.subjectWallet,
      trustInputs: record.satp.trustInputs.map((input) => ({
        claimType: input.claimType,
        metadataHash: input.metadataHash,
        requestHash: input.request.requestHash,
        genesisPda: input.request.genesisPda,
        attestationPda: input.request.attestationPda,
        unsigned: input.request.unsigned,
        signingRequired: input.request.signingRequired,
        transaction: input.request.transaction,
        instructions: input.request.instructions,
      })),
    },
    runtimePolicy: {
      recordVerified: policy.recordVerified,
      actionId: policy.action.actionId,
      actionType: policy.action.type,
      decision: policy.result.decision,
      reasonCodes: policy.result.reasonCodes,
    },
    guardrails: {
      callsRpc: record.integration.rpcRequired,
      writesSolanaState: false,
      readsKeypairs: false,
      signsTransactions: false,
      publishesPackages: false,
      deploysPrograms: false,
      mutatesAgentFolioData: false,
    },
  };
}

function run(argv = process.argv.slice(2)) {
  const profile = loadProfile(argv[0] || DEFAULT_PROFILE_PATH);
  const view = buildAgentFolioReadOnlyView({ profile });
  process.stdout.write(JSON.stringify(view, null, 2) + '\n');
}

if (require.main === module) {
  run();
}

module.exports = {
  buildAgentFolioReadOnlyView,
  loadProfile,
  run,
};

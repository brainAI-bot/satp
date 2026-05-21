'use strict';

const { PublicKey } = require('@solana/web3.js');
const programsFixture = require('../fixtures/programs.json');
const identitiesFixture = require('../fixtures/identities.json');
const {
  getV3ProgramIds,
  buildSatpTrustPacket,
} = require('../../../packages/satp-client/src');

const DEFAULT_NETWORK = 'devnet';
const EXAMPLE_ATTESTER = '11111111111111111111111111111111';
const ALLOWED_CLAIM_TYPES = new Set([
  'github_verified',
  'domain_verified',
  'wallet_control_verified',
  'capability_verified',
  'job_completed',
]);

function normalizeNetwork(network = DEFAULT_NETWORK) {
  if (network !== 'devnet' && network !== 'mainnet') {
    throw new Error(`Unsupported SATP network: ${network}`);
  }
  return network;
}

function validateWallet(wallet, field = 'wallet') {
  try {
    return new PublicKey(wallet).toBase58();
  } catch (err) {
    throw new Error(`Invalid ${field}: expected a Solana public key`);
  }
}

function programMapToStrings(programMap) {
  return Object.fromEntries(
    Object.entries(programMap).map(([name, publicKey]) => [name.toLowerCase(), publicKey.toBase58()])
  );
}

function getPrograms({ network = DEFAULT_NETWORK } = {}) {
  const selectedNetwork = normalizeNetwork(network);
  return {
    network: selectedNetwork,
    mode: 'readonly-fixture',
    programs: programMapToStrings(getV3ProgramIds(selectedNetwork)),
    fixtureMatchesSdk: JSON.stringify(programMapToStrings(getV3ProgramIds(selectedNetwork))) ===
      JSON.stringify(programsFixture[selectedNetwork]),
  };
}

async function resolveIdentity({ wallet, network = DEFAULT_NETWORK, mode = 'fixture' } = {}) {
  const selectedNetwork = normalizeNetwork(network);
  const selectedWallet = validateWallet(wallet);
  const fixtureIdentity = identitiesFixture[selectedNetwork]?.[selectedWallet] || null;

  if (mode === 'fixture' || mode === 'offline') {
    return {
      network: selectedNetwork,
      mode: 'fixture',
      wallet: selectedWallet,
      identity: fixtureIdentity,
      found: Boolean(fixtureIdentity),
    };
  }

  if (mode !== 'rpc') {
    throw new Error(`Unsupported resolve mode: ${mode}`);
  }
  if (process.env.SATP_EXAMPLE_ALLOW_RPC !== '1') {
    throw new Error('RPC mode is disabled; set SATP_EXAMPLE_ALLOW_RPC=1 to allow read-only account lookups');
  }

  const { Connection, clusterApiUrl } = require('@solana/web3.js');
  const connection = new Connection(clusterApiUrl(selectedNetwork === 'mainnet' ? 'mainnet-beta' : 'devnet'), 'confirmed');
  const account = await connection.getAccountInfo(new PublicKey(selectedWallet));
  return {
    network: selectedNetwork,
    mode: 'rpc-readonly',
    wallet: selectedWallet,
    account: account ? { lamports: account.lamports, owner: account.owner.toBase58(), executable: account.executable } : null,
    found: Boolean(account),
  };
}

function prepareAttestationRequest({
  subjectWallet,
  claimType,
  metadataHash,
  network = DEFAULT_NETWORK,
  attester = EXAMPLE_ATTESTER,
} = {}) {
  const selectedNetwork = normalizeNetwork(network);

  if (!ALLOWED_CLAIM_TYPES.has(claimType)) {
    throw new Error(`Unsupported claimType: ${claimType}`);
  }

  const trustPacket = buildSatpTrustPacket({
    subjectWallet,
    claimType,
    metadataHash,
    network: selectedNetwork,
    attester,
  });

  return {
    ...trustPacket,
    agentSeed: trustPacket.request.agentIdHash,
    note: 'Example output only; callers must build, review, and sign any write transaction outside this read-only runtime.',
  };
}

function createSatpReadonlyRuntime() {
  return {
    getPrograms,
    resolveIdentity,
    prepareAttestationRequest,
  };
}

module.exports = {
  createSatpReadonlyRuntime,
  getPrograms,
  resolveIdentity,
  prepareAttestationRequest,
  validateWallet,
};

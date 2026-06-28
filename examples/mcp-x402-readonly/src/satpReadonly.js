'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PublicKey } = require('@solana/web3.js');
const programsFixture = require('../fixtures/programs.json');
const identitiesFixture = require('../fixtures/identities.json');
const conformanceManifest = require('../fixtures/conformance-runtime.json');
const {
  getV3ProgramIds,
  buildSatpTrustPacket,
} = require('../../../packages/satp-client/src');

const DEFAULT_NETWORK = 'devnet';
const EXAMPLE_ATTESTER = '11111111111111111111111111111111';
const RPC_OPT_IN_ENV = 'SATP_EXAMPLE_ALLOW_RPC';
const RUNTIME_FIXTURE_DIR = path.join(__dirname, '..', 'fixtures');
const REQUIRED_CONFORMANCE_CLASSIFICATIONS = Object.freeze([
  'positive',
  'stale',
  'revoked',
  'malformed',
  'unsupported-issuer',
]);
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

function classifyConformanceFixture(fixture) {
  const expected = fixture && fixture.expected ? fixture.expected : {};
  const details = new Set(Array.isArray(expected.details) ? expected.details : []);

  if (expected.verdict === 'pass') return 'positive';
  if (details.has('stale') || details.has('schemaCompatibility')) return 'stale';
  if (details.has('revoked')) return 'revoked';
  if (details.has('issuerTrustClass')) return 'unsupported-issuer';
  return 'malformed';
}

function getConformanceFixtures({
  manifest = conformanceManifest,
  manifestDir = RUNTIME_FIXTURE_DIR,
} = {}) {
  if (manifest.schemaVersion !== 'satp.runtimeConformanceManifest.v1') {
    throw new Error('Unsupported conformance manifest schemaVersion');
  }

  const fixtureBase = path.resolve(manifestDir, manifest.source);
  const cases = manifest.cases.map((entry) => {
    const fixturePath = path.resolve(fixtureBase, entry.fixture);
    if (!fixturePath.startsWith(fixtureBase + path.sep)) {
      throw new Error(`Conformance fixture path escapes source: ${entry.fixture}`);
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const expectedDetails = Array.isArray(fixture.expected && fixture.expected.details)
      ? fixture.expected.details
      : [];
    const classification = classifyConformanceFixture(fixture);

    return {
      fixture: entry.fixture,
      id: fixture.id,
      recordType: fixture.record && fixture.record.recordType,
      classification,
      expectedVerdict: fixture.expected && fixture.expected.verdict,
      requiredDetails: entry.requiredDetails,
      details: expectedDetails,
      fixtureMatchesManifest: classification === entry.classification &&
        fixture.expected &&
        fixture.expected.verdict === entry.expectedVerdict &&
        entry.requiredDetails.every((detail) => expectedDetails.includes(detail)),
    };
  });

  const classifications = new Set(cases.map((entry) => entry.classification));
  return {
    mode: 'offline-conformance-fixtures',
    schemaVersion: manifest.schemaVersion,
    source: manifest.source,
    requiredClassifications: REQUIRED_CONFORMANCE_CLASSIFICATIONS,
    allRequiredClassificationsCovered: REQUIRED_CONFORMANCE_CLASSIFICATIONS.every((classification) =>
      classifications.has(classification)
    ),
    cases,
  };
}

function assertRpcReadOnlyOptIn(rpcOptIn = {}) {
  if (!rpcOptIn || rpcOptIn.enabled !== true || rpcOptIn.readOnly !== true) {
    throw new Error('RPC mode requires explicit rpcOptIn: { enabled: true, readOnly: true }');
  }
  if (rpcOptIn.signing === true || rpcOptIn.transactions === true || rpcOptIn.writes === true) {
    throw new Error('RPC mode is read-only only: signing, transactions, and writes must stay disabled');
  }
  return {
    enabled: true,
    readOnly: true,
    accountLookupOnly: true,
    signing: false,
    transactions: false,
    writes: false,
  };
}

async function resolveIdentity({
  wallet,
  network = DEFAULT_NETWORK,
  mode = 'fixture',
  rpcOptIn,
  connection,
} = {}) {
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
  const rpcReadOnly = assertRpcReadOnlyOptIn(rpcOptIn);
  if (process.env[RPC_OPT_IN_ENV] !== '1') {
    throw new Error(`RPC mode is disabled; set ${RPC_OPT_IN_ENV}=1 to allow read-only account lookups`);
  }

  const { Connection, clusterApiUrl } = require('@solana/web3.js');
  const readonlyConnection = connection ||
    new Connection(clusterApiUrl(selectedNetwork === 'mainnet' ? 'mainnet-beta' : 'devnet'), 'confirmed');
  const account = await readonlyConnection.getAccountInfo(new PublicKey(selectedWallet));
  return {
    network: selectedNetwork,
    mode: 'rpc-readonly',
    rpcOptIn: rpcReadOnly,
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
    getConformanceFixtures,
  };
}

module.exports = {
  createSatpReadonlyRuntime,
  getPrograms,
  resolveIdentity,
  prepareAttestationRequest,
  getConformanceFixtures,
  classifyConformanceFixture,
  assertRpcReadOnlyOptIn,
  validateWallet,
};

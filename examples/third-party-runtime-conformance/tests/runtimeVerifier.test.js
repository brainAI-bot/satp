'use strict';

const assert = require('node:assert/strict');
const dns = require('node:dns');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const tls = require('node:tls');
const {
  createThirdPartySatpRuntime,
  INTEROP_REASON_CODES,
  verifyInteropSessionIdentity,
  verifyPublishedIdentityArtifact,
  verifySatpAttestation,
  verifySatpIdentity,
  verifySatpTrustPacket,
} = require('../src/runtimeVerifier');

const INTEROP_FIXTURE_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'tests',
  'conformance',
  'fixtures',
  'interop-verifier-v0'
);
const INTEROP_NOW = '2026-08-14T14:00:00.000Z';

let networkAttempted = false;
function blockNetwork(apiName) {
  return function blockedNetworkCall() {
    networkAttempted = true;
    throw new Error('third-party conformance example must remain offline; blocked ' + apiName);
  };
}

http.request = blockNetwork('http.request');
http.get = blockNetwork('http.get');
https.request = blockNetwork('https.request');
https.get = blockNetwork('https.get');
net.connect = blockNetwork('net.connect');
net.createConnection = blockNetwork('net.createConnection');
tls.connect = blockNetwork('tls.connect');
dns.lookup = blockNetwork('dns.lookup');
dns.resolve = blockNetwork('dns.resolve');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadInteropFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(INTEROP_FIXTURE_DIR, name), 'utf8')).record;
}

function loadRuntimeBundle(runtime) {
  return {
    identity: runtime.loadFixture('identity-positive.json').record,
    attestation: runtime.loadFixture('attestation-positive.json').record,
    trustPacket: runtime.loadFixture('trust-packet-positive.json').record.packet,
  };
}

test('third-party runtime verifies positive identity, attestation, and trust packet fixtures', () => {
  const runtime = createThirdPartySatpRuntime();
  const result = runtime.verifyBundle(loadRuntimeBundle(runtime));

  assert.equal(result.ok, true);
  assert.equal(result.identity.ok, true);
  assert.equal(result.attestation.ok, true);
  assert.equal(result.trustPacket.ok, true);
  assert.equal(result.boundary.agentFolioRuntimeRequired, false);
  assert.equal(result.boundary.agentFolioApiRequired, false);
  assert.equal(result.boundary.networkAccessRequired, false);
  assert.equal(result.boundary.signingRequired, false);
});

test('third-party runtime rejects invalid identity records before app trust', () => {
  const runtime = createThirdPartySatpRuntime();
  const identity = clone(runtime.loadFixture('identity-positive.json').record);
  identity.primaryWallet = 'not-a-wallet';

  const result = verifySatpIdentity(identity);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /primaryWallet/);
});

test('third-party runtime rejects malformed attestations before app trust', () => {
  const runtime = createThirdPartySatpRuntime();
  const malformed = runtime.loadFixture('attestation-malformed.json').record;

  const result = verifySatpAttestation(malformed);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /schemaVersion/);
  assert.match(result.errors.join('\n'), /subjectIdentity/);
  assert.match(result.errors.join('\n'), /attestationPda/);
  assert.match(result.errors.join('\n'), /invalid-evidence/);
});

test('third-party runtime rejects malformed trust packets', () => {
  const runtime = createThirdPartySatpRuntime();
  const packet = clone(runtime.loadFixture('trust-packet-positive.json').record.packet);
  packet.flags.signingRequired = true;
  packet.signers.push('unexpected-signer');

  const result = verifySatpTrustPacket(packet);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /read-only|signers|trustPacket/);
});

test('third-party runtime rejects stale trust packets', () => {
  const runtime = createThirdPartySatpRuntime();
  const packet = runtime.loadFixture('trust-packet-positive.json').record.packet;
  const rebuilt = runtime.buildTrustPacket({
    subjectWallet: packet.subjectWallet,
    agentId: packet.agentId,
    claimType: packet.claimType,
    metadataHash: packet.metadataHash,
    attester: packet.attester,
    network: packet.network,
    expiresAt: 1704067200,
  });

  const result = verifySatpTrustPacket(rebuilt);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /stale/);
});

test('interop verifier binds stable identity, session, transport, persisted link, and receipt independently', () => {
  const result = verifyInteropSessionIdentity(
    loadInteropFixture('session-identity-positive.json'),
    {
      expectedAgentId: 'satp:agent:alpha',
      expectedSessionId: 'execution:alpha:001',
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.checks, {
    structurallyValid: true,
    identityContinuityValid: true,
    sessionBindingValid: true,
    receiptBindingValid: true,
    noSessionConflict: true,
  });
});

test('interop verifier surfaces a duplicate session as an explicit conflict', () => {
  const result = verifyInteropSessionIdentity(loadInteropFixture('session-identity-collision.json'));

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), new RegExp(INTEROP_REASON_CODES.SESSION_CONFLICT));
  assert.equal(result.checks.identityContinuityValid, true);
  assert.equal(result.checks.sessionBindingValid, true);
  assert.equal(result.checks.noSessionConflict, false);
});

test('interop verifier fails ambiguous legacy session records closed as identity_unknown', () => {
  const record = loadInteropFixture('session-identity-positive.json');
  delete record.provider.agentId;

  const result = verifyInteropSessionIdentity(record);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), new RegExp(INTEROP_REASON_CODES.IDENTITY_UNKNOWN));
});

test('published identity verifier separates subject binding, publication authority, and freshness', () => {
  const result = verifyPublishedIdentityArtifact(
    loadInteropFixture('published-identity-positive.json'),
    { now: INTEROP_NOW }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.checks, {
    structurallyValid: true,
    subjectBindingValid: true,
    publicationAuthorized: true,
    freshnessValid: true,
  });
});

test('HTTPS origin control does not substitute for controller-authorized publication', () => {
  const result = verifyPublishedIdentityArtifact(
    loadInteropFixture('published-identity-unauthorized.json'),
    { now: INTEROP_NOW }
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), new RegExp(INTEROP_REASON_CODES.PUBLICATION_UNAUTHORIZED));
  assert.equal(result.checks.subjectBindingValid, true);
  assert.equal(result.checks.publicationAuthorized, false);
  assert.equal(result.checks.freshnessValid, true);
});

test('a valid subject and publisher binding cannot make an expired artifact fresh', () => {
  const result = verifyPublishedIdentityArtifact(
    loadInteropFixture('published-identity-stale.json'),
    { now: INTEROP_NOW }
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), new RegExp(INTEROP_REASON_CODES.FRESHNESS_INVALID));
  assert.equal(result.checks.subjectBindingValid, true);
  assert.equal(result.checks.publicationAuthorized, true);
  assert.equal(result.checks.freshnessValid, false);
});

test('a fresh authorized publication cannot repair an invalid subject binding', () => {
  const record = loadInteropFixture('published-identity-positive.json');
  record.artifact.subjectBinding.subjectId = 'satp:agent:other';

  const result = verifyPublishedIdentityArtifact(record, { now: INTEROP_NOW });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), new RegExp(INTEROP_REASON_CODES.SUBJECT_BINDING_INVALID));
  assert.equal(result.checks.subjectBindingValid, false);
  assert.equal(result.checks.publicationAuthorized, true);
  assert.equal(result.checks.freshnessValid, true);
});

test('third-party example stays app-agnostic and free of AgentFolio runtime imports', () => {
  const runtime = createThirdPartySatpRuntime();
  assert.equal(runtime.boundary.agentFolioRuntimeRequired, false);
  assert.equal(runtime.boundary.dependency, '@brainai/satp-client');

  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'runtimeVerifier.js'), 'utf8');
  assert.equal(/require\([^)]*agentfolio/i.test(source), false);
});

test('third-party conformance example does not attempt network access', () => {
  assert.equal(networkAttempted, false);
});

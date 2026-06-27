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
  verifySatpAttestation,
  verifySatpIdentity,
  verifySatpTrustPacket,
} = require('../src/runtimeVerifier');

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

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
const { createFixtureFirstExternalAdapter } = require('../src/externalAdapter');
const { createThirdPartySatpRuntime } = require('../src/runtimeVerifier');

let networkAttempted = false;
function blockNetwork(apiName) {
  return function blockedNetworkCall() {
    networkAttempted = true;
    throw new Error('external fixture adapter must remain offline; blocked ' + apiName);
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

const CASE_PATH = path.join(__dirname, '..', 'fixtures', 'external-adapter-positive.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadCase() {
  return JSON.parse(fs.readFileSync(CASE_PATH, 'utf8'));
}

test('external host verifies the fixture manifest through an injected SATP adapter', () => {
  const runtime = createThirdPartySatpRuntime();
  const adapter = createFixtureFirstExternalAdapter({
    loadFixture: (name) => runtime.loadFixture(name),
  });

  const result = adapter.verifyCase(loadCase());

  assert.equal(result.ok, true);
  assert.equal(result.status, 'conformant');
  assert.deepEqual(result.checks, {
    identity: true,
    attestation: true,
    trustPacket: true,
  });
  assert.equal(result.boundary.externalConsumerOwned, true);
  assert.equal(result.boundary.agentFolioRuntimeRequired, false);
  assert.equal(result.boundary.networkAccessRequired, false);
  assert.equal(result.boundary.authorizationGranted, false);
});

test('external adapter fails a host-loaded tampered trust packet closed', () => {
  const runtime = createThirdPartySatpRuntime();
  const adapter = createFixtureFirstExternalAdapter({
    loadFixture(name) {
      const fixture = clone(runtime.loadFixture(name));
      if (name === 'trust-packet-positive.json') {
        fixture.record.packet.flags.signingRequired = true;
        fixture.record.packet.signers.push('unexpected-signer');
      }
      return fixture;
    },
  });

  const result = adapter.verifyCase(loadCase());

  assert.equal(result.ok, false);
  assert.equal(result.status, 'non_conformant');
  assert.equal(result.checks.trustPacket, false);
  assert.match(result.errors.join('\n'), /trustPacket/);
  assert.equal(result.boundary.authorizationGranted, false);
});

test('external adapter rejects unsafe fixture names before calling the host loader', () => {
  let loadAttempted = false;
  const adapter = createFixtureFirstExternalAdapter({
    loadFixture() {
      loadAttempted = true;
      throw new Error('must not load unsafe fixture names');
    },
  });
  const testCase = loadCase();
  testCase.fixtures.identity = '../identity-positive.json';

  assert.throws(() => adapter.verifyCase(testCase), /Invalid identity fixture name/);
  assert.equal(loadAttempted, false);
});

test('external adapter requires host evidence expectations before calling the host loader', () => {
  let loadAttempted = false;
  const adapter = createFixtureFirstExternalAdapter({
    loadFixture() {
      loadAttempted = true;
      throw new Error('must not load a case without host expectations');
    },
  });
  const testCase = loadCase();
  delete testCase.expectations.expectedEvidenceDigest;

  assert.throws(() => adapter.verifyCase(testCase), /expectedEvidenceDigest/);
  assert.equal(loadAttempted, false);
});

test('external adapter rejects unknown expectations before calling the host loader', () => {
  let loadAttempted = false;
  const adapter = createFixtureFirstExternalAdapter({
    loadFixture() {
      loadAttempted = true;
      throw new Error('must not load a case with unknown expectations');
    },
  });
  const testCase = loadCase();
  testCase.expectations.validationTime = 0;

  assert.throws(
    () => adapter.verifyCase(testCase),
    /unknown expectation: validationTime/
  );
  assert.equal(loadAttempted, false);
});

test('external adapter owns no filesystem, network, AgentFolio, signing, or transaction integration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'externalAdapter.js'), 'utf8');

  assert.equal(/require\(['"]node:(?:fs|dns|http|https|net|tls)/.test(source), false);
  assert.equal(/require\([^)]*agentfolio/i.test(source), false);
  assert.equal(/\.(?:sign|sendTransaction)\(|x402|keypair|deploy|publish/i.test(source), false);
  assert.equal(networkAttempted, false);
});

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  DECISIONS,
  REASON_CODES,
  X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
  parseX402DiscoveryMetadata,
  buildX402EvidenceLookup,
  buildRuntimePolicyActionDescriptorFromX402Discovery,
  buildRuntimePolicyActionDescriptorFromX402,
  evaluateRuntimePolicy,
} = require('./src');
const x402DiscoverySubpath = require('@brainai/satp-client/x402-discovery');
const {
  LOOKUP_SCHEMA_VERSION,
  runExample: runReputationEvidenceLookupExample,
} = require('./examples/x402-reputation-evidence-lookup-client');

const maliciousDiscovery = {
  action: 'satp.resolveIdentity',
  resource: 'satp://identity/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',
  endpoint: 'https://example.invalid/.well-known/x402/satp',
  accepts: [
    {
      scheme: 'exact',
      network: 'base-sepolia',
      asset: 'USDC',
      payTo: '0x0000000000000000000000000000000000000001',
      maxAmountRequired: '10000',
      resource: 'satp://identity/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',
      description: 'Read-only SATP evidence lookup',
      mimeType: 'application/json',
    },
  ],
  paymentAuthorization: true,
  actionAuthorization: true,
  spendAuthorized: true,
  livePaymentRequired: true,
};

const parsed = parseX402DiscoveryMetadata(maliciousDiscovery);
assert.equal(parsed.schemaVersion, 'satp.x402DiscoveryMetadata.v1');
assert.equal(parsed.protocol, 'x402');
assert.equal(parsed.resource, maliciousDiscovery.resource);
assert.equal(parsed.endpoint, maliciousDiscovery.endpoint);
assert.equal(parsed.action, 'satp.resolveIdentity');
assert.equal(parsed.paymentRequired, true);
assert.equal(parsed.paymentRequirements.length, 1);
assert.equal(parsed.paymentRequirements[0].network, 'base-sepolia');
assert.equal(parsed.guardrail, X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);

const evidenceLookup = buildX402EvidenceLookup(JSON.stringify(maliciousDiscovery), {
  sourceKind: 'well-known-x402',
  maxCostUsd: 0.05,
});
assert.equal(evidenceLookup.type, 'x402');
assert.equal(evidenceLookup.source.kind, 'well-known-x402');
assert.equal(evidenceLookup.source.url, maliciousDiscovery.endpoint);
assert.equal(evidenceLookup.endpoint, maliciousDiscovery.endpoint);
assert.equal(evidenceLookup.maxCostUsd, 0.05);
assert.equal(evidenceLookup.paymentRequired, true);
assert.equal(evidenceLookup.paymentAuthorization, false);
assert.equal(evidenceLookup.actionAuthorization, false);
assert.equal(evidenceLookup.livePaymentRequired, false);
assert.equal(evidenceLookup.spendAuthorized, false);
assert.equal(evidenceLookup.guardrail, X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);

const descriptor = buildRuntimePolicyActionDescriptorFromX402Discovery(maliciousDiscovery, {
  sourceKind: 'well-known-x402',
  maxCostUsd: 0.05,
});
assert.equal(descriptor.schemaVersion, 'satp.runtimePolicyActionDescriptor.v1');
assert.equal(descriptor.operation, 'satp.resolveIdentity');
assert.equal(descriptor.costUsd, 0);
assert.equal(descriptor.paymentAuthorization, false);
assert.equal(descriptor.actionAuthorization, false);
assert.equal(descriptor.spendAuthorized, false);
assert.equal(descriptor.livePaymentRequired, false);
assert.deepEqual(descriptor.evidenceLookup, evidenceLookup);

const policyResult = evaluateRuntimePolicy(
  {
    active: true,
    satpVerified: true,
    agentFolioTrustScore: 88,
    capabilities: [],
    evidenceUpdatedAt: '2026-04-01T00:00:00Z',
  },
  descriptor,
  { now: '2026-05-21T00:00:00Z' }
);
assert.equal(policyResult.decision, DECISIONS.NEEDS_APPROVAL);
assert.ok(policyResult.reasonCodes.includes(REASON_CODES.X402_LOOKUP_REQUIRES_APPROVAL));
assert.ok(policyResult.reasonCodes.includes(REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION));
assert.equal(policyResult.checks.evidenceLookup.type, 'x402');
assert.equal(policyResult.checks.evidenceLookup.endpoint, maliciousDiscovery.endpoint);

const nested = parseX402DiscoveryMetadata({
  x402: {
    resourceUrl: 'https://example.invalid/evidence.json',
    paymentRequirements: {
      scheme: 'exact',
      network: 'base',
      amountRequired: '1',
    },
  },
});
assert.equal(nested.resource, 'https://example.invalid/evidence.json');
assert.equal(nested.paymentRequirements.length, 1);

const acceptsOnlyResource = 'https://example.invalid/protected/satp-evidence.json';
const acceptsOnlyDiscovery = {
  accepts: [
    {
      scheme: 'exact',
      network: 'base',
      amountRequired: '1',
      resource: acceptsOnlyResource,
    },
  ],
};
const acceptsOnlyParsed = parseX402DiscoveryMetadata(acceptsOnlyDiscovery);
assert.equal(acceptsOnlyParsed.resource, acceptsOnlyResource);
const acceptsOnlyEvidenceLookup = buildX402EvidenceLookup(acceptsOnlyDiscovery);
assert.equal(acceptsOnlyEvidenceLookup.resource, acceptsOnlyResource);
assert.equal(acceptsOnlyEvidenceLookup.source.url, acceptsOnlyResource);
const acceptsOnlyDescriptor = buildRuntimePolicyActionDescriptorFromX402Discovery(acceptsOnlyDiscovery);
assert.equal(acceptsOnlyDescriptor.resource, acceptsOnlyResource);
assert.equal(acceptsOnlyDescriptor.evidenceLookup.resource, acceptsOnlyResource);
assert.equal(acceptsOnlyDescriptor.evidenceLookup.source.url, acceptsOnlyResource);

assert.equal(buildRuntimePolicyActionDescriptorFromX402, buildRuntimePolicyActionDescriptorFromX402Discovery);
assert.equal(typeof x402DiscoverySubpath.parseX402DiscoveryMetadata, 'function');
assert.equal(typeof x402DiscoverySubpath.buildX402EvidenceLookup, 'function');
assert.equal(typeof x402DiscoverySubpath.buildRuntimePolicyActionDescriptorFromX402Discovery, 'function');
assert.equal(LOOKUP_SCHEMA_VERSION, 'satp.x402ReputationEvidenceLookup.v1');

assert.throws(
  () => parseX402DiscoveryMetadata('not json'),
  /x402 discovery metadata must be an object or JSON object string/
);
assert.throws(
  () => parseX402DiscoveryMetadata({ accepts: ['not an object'] }),
  /x402 payment requirement must be an object/
);
assert.throws(
  () => buildX402EvidenceLookup(maliciousDiscovery, { maxCostUsd: -1 }),
  /maxCostUsd must be a finite non-negative number/
);

runReputationEvidenceLookupExample().then((example) => {
  assert.equal(example.guardrail, X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
  assert.equal(example.paymentAuthorization, false);
  assert.equal(example.actionAuthorization, false);
  assert.equal(example.spendAuthorized, false);
  assert.equal(example.livePaymentRequired, false);
  console.log('x402 discovery helper OK');
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

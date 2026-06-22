#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
  parseX402DiscoveryMetadata,
  buildX402EvidenceLookup,
  buildRuntimePolicyActionDescriptorFromX402,
} = require('./src');
const x402DiscoverySubpath = require('@brainai/satp-client/x402-discovery');

const discovery = {
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

const parsed = parseX402DiscoveryMetadata(discovery);
assert.equal(parsed.schemaVersion, 'satp.x402DiscoveryMetadata.v1');
assert.equal(parsed.protocol, 'x402');
assert.equal(parsed.resource, discovery.resource);
assert.equal(parsed.endpoint, discovery.endpoint);
assert.equal(parsed.action, 'satp.resolveIdentity');
assert.equal(parsed.paymentRequired, true);
assert.equal(parsed.paymentRequirements.length, 1);
assert.equal(parsed.paymentRequirements[0].network, 'base-sepolia');
assert.equal(parsed.guardrail, X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);

const evidenceLookup = buildX402EvidenceLookup(JSON.stringify(discovery), {
  sourceKind: 'well-known-x402',
});
assert.equal(evidenceLookup.type, 'x402-discovery');
assert.equal(evidenceLookup.source.kind, 'well-known-x402');
assert.equal(evidenceLookup.source.url, discovery.endpoint);
assert.equal(evidenceLookup.paymentRequired, true);
assert.equal(evidenceLookup.livePaymentRequired, false);
assert.equal(evidenceLookup.spendAuthorized, false);
assert.equal(evidenceLookup.guardrail, X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);

const descriptor = buildRuntimePolicyActionDescriptorFromX402(discovery, {
  sourceKind: 'well-known-x402',
});
assert.equal(descriptor.schemaVersion, 'satp.runtimePolicyActionDescriptor.v1');
assert.equal(descriptor.action, 'satp.resolveIdentity');
assert.deepEqual(descriptor.instructions, []);
assert.deepEqual(descriptor.signers, []);
assert.equal(descriptor.transaction, null);
assert.equal(descriptor.authorization.actionAuthorization, false);
assert.equal(descriptor.authorization.paymentAuthorization, false);
assert.equal(descriptor.authorization.spendAuthorized, false);
assert.equal(descriptor.authorization.livePaymentRequired, false);
assert.equal(descriptor.authorization.reason, X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
assert.deepEqual(descriptor.evidenceLookup, evidenceLookup);

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

assert.equal(typeof x402DiscoverySubpath.parseX402DiscoveryMetadata, 'function');
assert.equal(typeof x402DiscoverySubpath.buildX402EvidenceLookup, 'function');
assert.equal(typeof x402DiscoverySubpath.buildRuntimePolicyActionDescriptorFromX402, 'function');

assert.throws(
  () => parseX402DiscoveryMetadata('not json'),
  /x402 discovery metadata must be an object or JSON object string/
);
assert.throws(
  () => parseX402DiscoveryMetadata({ accepts: ['not an object'] }),
  /x402 payment requirement must be an object/
);

console.log('x402 discovery helper OK');

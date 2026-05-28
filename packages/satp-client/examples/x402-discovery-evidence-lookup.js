#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
  parseX402DiscoveryMetadata,
  buildX402EvidenceLookup,
  buildRuntimePolicyActionDescriptorFromX402Discovery,
} = require('../src');

const discoveryMetadata = {
  action: 'satp.resolveIdentity',
  endpoint: 'https://example.invalid/.well-known/x402/satp',
  accepts: [
    {
      scheme: 'exact',
      network: 'base',
      asset: 'USDC',
      amountRequired: '1',
      resource: 'satp://identity/brainChain',
      description: 'Read-only SATP evidence lookup',
      mimeType: 'application/json',
    },
  ],
};

const discovery = parseX402DiscoveryMetadata(discoveryMetadata);
const evidenceLookup = buildX402EvidenceLookup(discoveryMetadata, {
  sourceKind: 'well-known-x402',
  maxCostUsd: 0.01,
});
const descriptor = buildRuntimePolicyActionDescriptorFromX402Discovery(discoveryMetadata, {
  sourceKind: 'well-known-x402',
  maxCostUsd: 0.01,
});

assert.equal(discovery.guardrail, X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
assert.equal(evidenceLookup.guardrail, X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
assert.equal(evidenceLookup.paymentAuthorization, false);
assert.equal(evidenceLookup.actionAuthorization, false);
assert.equal(evidenceLookup.spendAuthorized, false);
assert.equal(evidenceLookup.livePaymentRequired, false);
assert.equal(descriptor.guardrail, X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
assert.equal(descriptor.paymentAuthorization, false);
assert.equal(descriptor.actionAuthorization, false);
assert.equal(descriptor.spendAuthorized, false);
assert.equal(descriptor.livePaymentRequired, false);
assert.deepEqual(descriptor.evidenceLookup, evidenceLookup);

console.log(JSON.stringify(
  {
    resource: discovery.resource,
    endpoint: discovery.endpoint,
    evidenceLookupType: evidenceLookup.type,
    operation: descriptor.operation,
    guardrail: descriptor.guardrail,
    paymentAuthorization: descriptor.paymentAuthorization,
    actionAuthorization: descriptor.actionAuthorization,
    spendAuthorized: descriptor.spendAuthorized,
    livePaymentRequired: descriptor.livePaymentRequired,
    warning: 'x402 payment metadata is discovery/evidence lookup only; it is not action authorization.',
  },
  null,
  2
));

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
  buildRuntimePolicyActionDescriptorFromX402Discovery,
} = require('../src');

const LOOKUP_SCHEMA_VERSION = 'satp.x402ReputationEvidenceLookup.v1';

const discoveryMetadata = {
  schemaVersion: 'satp.x402DiscoveryMetadata.v1',
  protocol: 'x402',
  action: 'satp.reputationEvidence.lookup',
  endpoint: 'https://satp-provider.example/v1/satp/evidence/reputation',
  resource: 'satp://evidence/reputation',
  paymentRequired: true,
  accepts: [
    {
      scheme: 'exact',
      network: '<provider-selected-payment-network>',
      asset: '<provider-selected-asset>',
      payTo: '<provider-controlled-recipient>',
      maxAmountRequired: '<provider-disclosed-maximum>',
      resource: 'https://satp-provider.example/v1/satp/evidence/reputation',
      description: 'Read-only SATP reputation evidence lookup',
      mimeType: 'application/json',
      maxTimeoutSeconds: 60,
    },
  ],
  guardrail: X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
};

function buildLookupUrl(endpoint, request) {
  const url = new URL(endpoint);
  if (request.agentId) url.searchParams.set('agentId', request.agentId);
  if (request.wallet) url.searchParams.set('wallet', request.wallet);
  if (request.network) url.searchParams.set('network', request.network);
  if (request.include) url.searchParams.set('include', request.include.join(','));
  if (request.minEvidenceUpdatedAt) url.searchParams.set('minEvidenceUpdatedAt', request.minEvidenceUpdatedAt);
  if (request.trace) url.searchParams.set('trace', request.trace);
  return url;
}

function assertLookupBoundary(body) {
  assert.equal(body.schemaVersion, LOOKUP_SCHEMA_VERSION);
  assert.equal(body.policyBoundary.guardrail, X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
  assert.equal(body.policyBoundary.paymentAuthorization, false);
  assert.equal(body.policyBoundary.actionAuthorization, false);
  assert.equal(body.policyBoundary.spendAuthorized, false);
}

async function fetchSatpReputationEvidence({
  fetchImpl,
  endpoint = discoveryMetadata.endpoint,
  request,
  x402PaymentHeader,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required for this offline example');
  const url = buildLookupUrl(endpoint, request);
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-PAYMENT': x402PaymentHeader,
    },
  });
  const body = await response.json();
  assertLookupBoundary(body);
  if (!response.ok) {
    throw new Error(body.error && body.error.code ? body.error.code : 'satp_lookup_failed');
  }
  return body;
}

function createMockFetch() {
  return async function mockFetch(url, options = {}) {
    assert.equal(url.pathname, '/v1/satp/evidence/reputation');
    assert.equal(url.searchParams.get('agentId'), 'brainChain');
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(options.headers['X-PAYMENT'], 'fixture-x402-payment-proof');

    return {
      ok: true,
      async json() {
        return {
          schemaVersion: LOOKUP_SCHEMA_VERSION,
          lookup: {
            lookupId: 'lkp_fixture_brainchain_devnet_01',
            agentId: 'brainChain',
            wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',
            network: 'devnet',
            queriedAt: '2026-07-28T03:18:00Z',
          },
          reputation: {
            score: 88,
            tier: 'trusted',
            sourceProgram: 'reputation_v3',
            computedAt: '2026-07-28T03:10:00Z',
          },
          evidence: {
            attestations: [
              {
                claimType: 'github_verified',
                issuer: 'satp-attestation-authority',
                status: 'valid',
              },
            ],
          },
          proof: {
            source: 'satp',
            programSet: 'v3',
            trace: 'redacted',
            evidenceUpdatedAt: '2026-07-28T03:10:00Z',
          },
          policyBoundary: {
            paymentAuthorization: false,
            actionAuthorization: false,
            spendAuthorized: false,
            livePaymentRequiredByClient: false,
            guardrail: X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
            message: 'x402 payment grants lookup access only and does not authorize SATP agent actions.',
          },
        };
      },
    };
  };
}

async function runExample() {
  const descriptor = buildRuntimePolicyActionDescriptorFromX402Discovery(discoveryMetadata, {
    sourceKind: 'well-known-x402',
    maxCostUsd: 0,
  });
  assert.equal(descriptor.operation, 'satp.reputationEvidence.lookup');
  assert.equal(descriptor.paymentAuthorization, false);
  assert.equal(descriptor.actionAuthorization, false);
  assert.equal(descriptor.spendAuthorized, false);
  assert.equal(descriptor.livePaymentRequired, false);

  const body = await fetchSatpReputationEvidence({
    fetchImpl: createMockFetch(),
    request: {
      agentId: 'brainChain',
      network: 'devnet',
      include: ['identity', 'reputation', 'attestations', 'policy'],
      trace: 'redacted',
    },
    x402PaymentHeader: 'fixture-x402-payment-proof',
  });

  return {
    endpoint: discoveryMetadata.endpoint,
    lookupId: body.lookup.lookupId,
    score: body.reputation.score,
    guardrail: body.policyBoundary.guardrail,
    paymentAuthorization: body.policyBoundary.paymentAuthorization,
    actionAuthorization: body.policyBoundary.actionAuthorization,
    spendAuthorized: body.policyBoundary.spendAuthorized,
    livePaymentRequired: descriptor.livePaymentRequired,
  };
}

if (require.main === module) {
  runExample()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
}

module.exports = {
  LOOKUP_SCHEMA_VERSION,
  discoveryMetadata,
  buildLookupUrl,
  assertLookupBoundary,
  fetchSatpReputationEvidence,
  createMockFetch,
  runExample,
};

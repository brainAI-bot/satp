'use strict';

const X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION = 'X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION';
const X402_DISCOVERY_SCHEMA_VERSION = 'satp.x402DiscoveryMetadata.v1';
const RUNTIME_POLICY_ACTION_DESCRIPTOR_SCHEMA_VERSION = 'satp.runtimePolicyActionDescriptor.v1';

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value, label) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(label + ' must be an object or JSON object string');
  }
}

function optionalString(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function optionalNumber(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(label + ' must be a finite non-negative number');
  }
  return number;
}

function copyPaymentRequirement(requirement) {
  if (!isRecord(requirement)) {
    throw new Error('x402 payment requirement must be an object');
  }

  const out = {};
  for (const key of [
    'scheme',
    'network',
    'asset',
    'payTo',
    'maxAmountRequired',
    'amountRequired',
    'resource',
    'description',
    'mimeType',
    'maxTimeoutSeconds',
    'extra',
  ]) {
    if (requirement[key] !== undefined) out[key] = requirement[key];
  }
  return out;
}

function firstPresent(values) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizePaymentRequirements(x402) {
  const value = firstPresent([
    x402.accepts,
    x402.paymentRequirements,
    isRecord(x402.payment) ? x402.payment.accepts : undefined,
    isRecord(x402.payment) ? x402.payment.requirements : undefined,
    isRecord(x402.x402) ? x402.x402.accepts : undefined,
    isRecord(x402.x402) ? x402.x402.paymentRequirements : undefined,
  ]);

  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(copyPaymentRequirement);
}

function firstPaymentRequirementResource(paymentRequirements) {
  for (const requirement of paymentRequirements) {
    const resource = optionalString(requirement.resource);
    if (resource) return resource;
  }
  return null;
}

function resolveDiscoveryEnvelope(input) {
  const metadata = parseJsonObject(input, 'x402 discovery metadata');
  if (!isRecord(metadata)) {
    throw new Error('x402 discovery metadata must be an object');
  }

  if (
    isRecord(metadata.x402)
    && metadata.accepts === undefined
    && metadata.paymentRequirements === undefined
    && metadata.payment === undefined
  ) {
    return { envelope: metadata, x402: metadata.x402 };
  }
  return { envelope: metadata, x402: metadata };
}

function parseX402DiscoveryMetadata(input) {
  const { envelope, x402 } = resolveDiscoveryEnvelope(input);
  const paymentRequirements = normalizePaymentRequirements(x402);
  const endpoint = optionalString(firstPresent([
    x402.endpoint,
    x402.discoveryEndpoint,
    x402.url,
    envelope.endpoint,
    envelope.discoveryEndpoint,
    envelope.url,
  ]));
  const resource = optionalString(firstPresent([
    x402.resource,
    x402.resourceUrl,
    envelope.resource,
    envelope.resourceUrl,
  ])) || firstPaymentRequirementResource(paymentRequirements);

  return {
    schemaVersion: X402_DISCOVERY_SCHEMA_VERSION,
    protocol: 'x402',
    resource,
    endpoint,
    action: optionalString(firstPresent([envelope.action, x402.action, envelope.operation, x402.operation])),
    paymentRequired: paymentRequirements.length > 0 || x402.paymentRequired === true || envelope.paymentRequired === true,
    paymentRequirements,
    guardrail: X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
  };
}

function buildX402EvidenceLookup(input, opts = {}) {
  const discovery = parseX402DiscoveryMetadata(input);
  return {
    type: 'x402',
    endpoint: opts.endpoint || discovery.endpoint,
    maxCostUsd: optionalNumber(opts.maxCostUsd, 'maxCostUsd'),
    protocol: 'x402',
    source: {
      kind: opts.sourceKind || 'x402-discovery-metadata',
      url: opts.sourceUrl || discovery.endpoint || discovery.resource,
    },
    resource: discovery.resource,
    paymentRequired: discovery.paymentRequired,
    paymentRequirements: discovery.paymentRequirements,
    discovery,
    guardrail: X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
    paymentAuthorization: false,
    actionAuthorization: false,
    spendAuthorized: false,
    livePaymentRequired: false,
  };
}

function buildRuntimePolicyActionDescriptorFromX402Discovery(input, opts = {}) {
  const discovery = parseX402DiscoveryMetadata(input);
  return {
    schemaVersion: RUNTIME_POLICY_ACTION_DESCRIPTOR_SCHEMA_VERSION,
    type: opts.type || 'x402_evidence_lookup',
    resource: opts.resource || discovery.resource || discovery.endpoint,
    operation: opts.operation || discovery.action || 'lookup',
    requiresFreshEvidence: opts.requiresFreshEvidence !== false,
    evidenceLookup: buildX402EvidenceLookup(input, opts),
    costUsd: 0,
    paymentAuthorization: false,
    actionAuthorization: false,
    spendAuthorized: false,
    livePaymentRequired: false,
    guardrail: X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
  };
}

module.exports = {
  X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
  X402_DISCOVERY_SCHEMA_VERSION,
  RUNTIME_POLICY_ACTION_DESCRIPTOR_SCHEMA_VERSION,
  parseX402DiscoveryMetadata,
  buildX402EvidenceLookup,
  buildRuntimePolicyActionDescriptorFromX402Discovery,
  buildRuntimePolicyActionDescriptorFromX402: buildRuntimePolicyActionDescriptorFromX402Discovery,
};

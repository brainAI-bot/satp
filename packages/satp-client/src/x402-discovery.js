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

function asOptionalString(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function copyKnownRequirementFields(requirement) {
  const keys = [
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
  ];
  const out = {};
  for (const key of keys) {
    if (requirement[key] !== undefined) out[key] = requirement[key];
  }
  return out;
}

function normalizePaymentRequirement(value) {
  if (!isRecord(value)) {
    throw new Error('x402 payment requirement must be an object');
  }
  return copyKnownRequirementFields(value);
}

function normalizePaymentRequirements(metadata) {
  const candidates = [
    metadata.accepts,
    metadata.paymentRequirements,
    metadata.payment?.accepts,
    metadata.payment?.requirements,
    metadata.x402?.accepts,
    metadata.x402?.paymentRequirements,
  ].filter((value) => value !== undefined && value !== null);

  if (candidates.length === 0) return [];
  const first = candidates[0];
  const requirements = Array.isArray(first) ? first : [first];
  return requirements.map(normalizePaymentRequirement);
}

function resolveDiscoveryEnvelope(input) {
  const metadata = parseJsonObject(input, 'x402 discovery metadata');
  if (!isRecord(metadata)) {
    throw new Error('x402 discovery metadata must be an object');
  }
  if (isRecord(metadata.x402) && !metadata.accepts && !metadata.paymentRequirements && !metadata.payment) {
    return { envelope: metadata, x402: metadata.x402 };
  }
  return { envelope: metadata, x402: metadata };
}

function parseX402DiscoveryMetadata(input) {
  const { envelope, x402 } = resolveDiscoveryEnvelope(input);
  const paymentRequirements = normalizePaymentRequirements(x402);
  const resource = asOptionalString(
    x402.resource ?? x402.resourceUrl ?? x402.url ?? envelope.resource ?? envelope.resourceUrl ?? envelope.url
  );
  const endpoint = asOptionalString(
    x402.endpoint ?? x402.discoveryEndpoint ?? envelope.endpoint ?? envelope.discoveryEndpoint
  );
  const action = asOptionalString(envelope.action ?? x402.action);

  return {
    schemaVersion: X402_DISCOVERY_SCHEMA_VERSION,
    protocol: 'x402',
    resource,
    endpoint,
    action,
    paymentRequired: paymentRequirements.length > 0 || x402.paymentRequired === true || envelope.paymentRequired === true,
    paymentRequirements,
    guardrail: X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
  };
}

function buildX402EvidenceLookup(input, opts = {}) {
  const parsed = parseX402DiscoveryMetadata(input);
  return {
    type: 'x402-discovery',
    protocol: 'x402',
    source: {
      kind: opts.sourceKind || 'discovery-metadata',
      url: opts.sourceUrl || parsed.endpoint || null,
    },
    resource: parsed.resource,
    endpoint: parsed.endpoint,
    paymentRequired: parsed.paymentRequired,
    paymentRequirements: parsed.paymentRequirements,
    guardrail: X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
    livePaymentRequired: false,
    spendAuthorized: false,
  };
}

function buildRuntimePolicyActionDescriptorFromX402(input, opts = {}) {
  const evidenceLookup = buildX402EvidenceLookup(input, opts);
  return {
    schemaVersion: RUNTIME_POLICY_ACTION_DESCRIPTOR_SCHEMA_VERSION,
    action: opts.action || parseX402DiscoveryMetadata(input).action || 'satp.evidence.lookup',
    evidenceLookup,
    authorization: {
      actionAuthorization: false,
      paymentAuthorization: false,
      spendAuthorized: false,
      livePaymentRequired: false,
      reason: X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
    },
    instructions: [],
    signers: [],
    transaction: null,
  };
}

module.exports = {
  X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
  X402_DISCOVERY_SCHEMA_VERSION,
  RUNTIME_POLICY_ACTION_DESCRIPTOR_SCHEMA_VERSION,
  parseX402DiscoveryMetadata,
  buildX402EvidenceLookup,
  buildRuntimePolicyActionDescriptorFromX402,
};

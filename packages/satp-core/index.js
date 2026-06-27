'use strict';

const client = require('@brainai/satp-client');

module.exports = {
  prepareIdentityAttestationRequest: client.prepareIdentityAttestationRequest,
  TRUST_PACKET_SCHEMA_VERSION: client.TRUST_PACKET_SCHEMA_VERSION,
  buildSatpTrustPacket: client.buildSatpTrustPacket,
  validateSatpTrustPacket: client.validateSatpTrustPacket,
  DECISIONS: client.DECISIONS,
  DEFAULT_POLICY: client.DEFAULT_POLICY,
  REASON_CODES: client.REASON_CODES,
  evaluateRuntimePolicy: client.evaluateRuntimePolicy,
  X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION: client.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION,
  X402_DISCOVERY_SCHEMA_VERSION: client.X402_DISCOVERY_SCHEMA_VERSION,
  RUNTIME_POLICY_ACTION_DESCRIPTOR_SCHEMA_VERSION: client.RUNTIME_POLICY_ACTION_DESCRIPTOR_SCHEMA_VERSION,
  parseX402DiscoveryMetadata: client.parseX402DiscoveryMetadata,
  buildX402EvidenceLookup: client.buildX402EvidenceLookup,
  buildRuntimePolicyActionDescriptorFromX402Discovery: client.buildRuntimePolicyActionDescriptorFromX402Discovery,
  buildRuntimePolicyActionDescriptorFromX402: client.buildRuntimePolicyActionDescriptorFromX402,
};

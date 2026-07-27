'use strict';

const { createSatpReadonlyRuntime } = require('./satpReadonly');
const { createMockX402Gate } = require('./x402Gate');
const {
  buildMcpProtectedToolPolicyExample,
  buildX402PaidEndpointPolicyExample,
} = require('./runtimePolicyExamples');

function createSatpMcpX402Server({ runtime = createSatpReadonlyRuntime(), gate = createMockX402Gate() } = {}) {
  const tools = {
    'satp.getPrograms': runtime.getPrograms,
    'satp.resolveIdentity': runtime.resolveIdentity,
    'satp.prepareAttestationRequest': runtime.prepareAttestationRequest,
    'satp.getConformanceFixtures': runtime.getConformanceFixtures,
    'satp.evaluateProtectedToolPolicy': buildMcpProtectedToolPolicyExample,
    'satp.evaluateX402EndpointPolicy': buildX402PaidEndpointPolicyExample,
  };

  return {
    listTools() {
      return Object.keys(tools).map((name) => ({ name, readonly: true }));
    },

    async callTool(name, args = {}, request = {}) {
      if (!tools[name]) {
        throw new Error(`Unknown tool: ${name}`);
      }
      const gateResult = await gate.verify({ headers: request.headers || {}, toolName: name });
      if (!gateResult.allowed) {
        return { ok: false, gate: gateResult, result: null };
      }
      return { ok: true, gate: gateResult, result: await tools[name](args) };
    },
  };
}

module.exports = {
  createSatpMcpX402Server,
};

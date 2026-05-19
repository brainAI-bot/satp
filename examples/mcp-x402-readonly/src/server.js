'use strict';

const {
  CONFORMANCE_PREFLIGHT,
  CONFORMANCE_READONLY,
  conformanceDescriptor,
  createSatpReadonlyRuntime,
} = require('./satpReadonly');
const { createMockX402Gate } = require('./x402Gate');

function createSatpMcpX402Server({ runtime = createSatpReadonlyRuntime(), gate = createMockX402Gate() } = {}) {
  const tools = {
    'satp.getPrograms': { handler: runtime.getPrograms, conformance: CONFORMANCE_READONLY },
    'satp.resolveIdentity': { handler: runtime.resolveIdentity, conformance: CONFORMANCE_READONLY },
    'satp.prepareAttestationRequest': { handler: runtime.prepareAttestationRequest, conformance: CONFORMANCE_PREFLIGHT },
  };

  return {
    listTools() {
      return Object.entries(tools).map(([name, tool]) => ({
        name,
        readonly: true,
        conformance: conformanceDescriptor(tool.conformance),
      }));
    },

    async callTool(name, args = {}, request = {}) {
      const tool = tools[name];
      if (!tool) {
        throw new Error('Unknown tool: ' + name);
      }
      const gateResult = await gate.verify({ headers: request.headers || {}, toolName: name });
      if (!gateResult.allowed) {
        return { ok: false, gate: gateResult, result: null };
      }
      return { ok: true, gate: gateResult, result: await tool.handler(args) };
    },
  };
}

module.exports = {
  createSatpMcpX402Server,
};

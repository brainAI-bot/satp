# SATP adoption quickstarts

These quickstarts are for external builders who want copy-paste starting points
for SATP adoption without taking a dependency on AgentFolio internals.

SATP package usage is free/open for local SDK use, MCP tools, agent runtimes,
and private reputation endpoints. brainAI monetizes only when a caller uses a
brainAI, AgentFolio, or SATP-hosted reputation/evidence lookup endpoint that is
x402-gated. There are no SATP royalties, protocol tolls, automatic SDK usage
fees, launch approvals, partnership claims, or live endpoint activation in
these examples.

All examples below are offline by default. They do not publish npm packages,
write to Solana devnet or mainnet, read or move keypairs, deploy programs,
restart production, charge live x402 payments, or authorize agent actions from
a payment.

## Install

Use the stable public client package for normal consumer adoption:

```bash
npm install @brainai/satp-client
```

For PR review before a package release, pin the reviewed repository commit
instead of treating branch code as npm `latest`:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>"
  }
}
```

Do not use `@brainai/satp` as the public install target yet. It remains the
future umbrella package until a separate release gate publishes it and updates
install-ready docs.

## MCP tool/server builders

Use SATP helpers behind read-only MCP tools when a host wants identity or trust
metadata without giving the tool a signer, fee payer, or transaction path.

```js
const {
  buildSatpTrustPacket,
  validateSatpTrustPacket,
  getV3ProgramIds,
} = require('@brainai/satp-client');

function createSatpMcpTools() {
  return {
    'satp.getPrograms': async ({ network = 'devnet' } = {}) => ({
      network,
      programs: getV3ProgramIds(network),
      guardrails: {
        readOnly: true,
        writesSolanaState: false,
        usesKeypairs: false,
      },
    }),

    'satp.prepareAttestationRequest': async ({
      subjectWallet,
      agentId,
      claimType = 'identity',
      metadataHash,
      network = 'devnet',
    }) => {
      const packet = buildSatpTrustPacket({
        subjectWallet,
        agentId,
        claimType,
        metadataHash,
        network,
      });
      const validation = validateSatpTrustPacket(packet);
      if (!validation.ok) throw new Error(validation.errors.join('; '));

      return {
        packet,
        guardrails: {
          readOnly: true,
          livePaymentRequired: false,
          transaction: null,
        },
      };
    },
  };
}

const tools = createSatpMcpTools();
tools['satp.prepareAttestationRequest']({
  subjectWallet: '11111111111111111111111111111111',
  agentId: 'example-mcp-agent',
  metadataHash: '93d122f8879fe87c186c10a00db8fbc80a73cecd2ede44b9ffa6410be3c2b805',
}).then((result) => console.log(result.packet.mode));
```

Repo reference:
[`examples/mcp-x402-readonly/`](../examples/mcp-x402-readonly/) contains a
fixture-first MCP-style server and offline tests.

## A2A and agent-runtime builders

Use the runtime policy adapter when an agent runtime needs a local SATP-backed
decision before allowing a tool call, message route, or delegated action. The
decision remains local to the host runtime.

```js
const { createRuntimePolicyAdapter } = require('@brainai/satp-client');

const now = new Date().toISOString();
const adapter = createRuntimePolicyAdapter({
  policy: {
    minimumTrustScore: 70,
    denyTrustScoreBelow: 25,
    requireVerifiedIdentity: true,
    maxAutoSpendUsd: 0,
  },
});

const identity = {
  agentId: 'partner-runtime-agent',
  active: true,
  satpVerified: true,
  trustScore: 82,
  capabilities: ['a2a:task.delegate'],
  evidenceUpdatedAt: now,
};

const action = adapter.action({
  type: 'a2a_agent_runtime',
  resource: 'a2a://task/delegate',
  operation: 'delegate',
  capability: 'a2a:task.delegate',
  requiresFreshEvidence: true,
  operatorApprovalRequired: false,
});

const result = adapter.evaluate(identity, action, { now });
const auditTrace = adapter.auditTrace(identity, action, { result, now });

console.log(result.decision, result.reasonCodes);
console.log(auditTrace.guardrails.localDecisionOnly);
```

Repo reference:
[`examples/third-party-runtime-conformance/`](../examples/third-party-runtime-conformance/)
shows a generic third-party runtime verifying SATP fixture records without
AgentFolio infrastructure.

## x402 paid-endpoint builders

Use x402 only around reputation, trust, or evidence lookup endpoints. Payment
can grant lookup access, but it is not authorization for an agent action, a
Solana write, or a production mutation.

```js
const {
  buildRuntimePolicyActionDescriptorFromX402Discovery,
  createRuntimePolicyAdapter,
} = require('@brainai/satp-client');

const discovery = {
  endpoint: 'https://api.example.test/satp/reputation',
  action: 'lookup',
  accepts: [{
    scheme: 'exact',
    network: 'solana-mainnet',
    asset: 'USDC',
    maxAmountRequired: '10000',
    resource: 'https://api.example.test/satp/reputation',
    description: 'SATP-backed reputation evidence lookup',
  }],
};

const lookupAction = buildRuntimePolicyActionDescriptorFromX402Discovery(
  discovery,
  { maxCostUsd: 0.01 }
);
const adapter = createRuntimePolicyAdapter({
  policy: { maxAutoSpendUsd: 0, minimumTrustScore: 70 },
});

const identity = {
  agentId: 'x402-consumer-agent',
  active: true,
  satpVerified: true,
  trustScore: 90,
  capabilities: ['satp:evidence.lookup'],
  evidenceUpdatedAt: '2026-05-21T00:00:00Z',
};

const result = adapter.evaluate(identity, lookupAction, {
  evidenceLookupPaymentPreapproved: false,
});

console.log(result.decision);
console.log(lookupAction.evidenceLookup.guardrail);
```

Expected behavior for this copy-paste shape:

- the SATP SDK/package remains free/open for local use;
- x402 is scoped to the paid lookup endpoint only;
- `evidenceLookupPaymentPreapproved: false` keeps live spend approval-gated;
- payment metadata does not authorize downstream agent actions;
- third-party private reputation endpoints are not automatically monetized by
  brainAI.

Repo references:
[`examples/mcp-x402-readonly/`](../examples/mcp-x402-readonly/) includes a mock
x402 verifier and
[`docs/x402-reputation-evidence-lookup-api.md`](./x402-reputation-evidence-lookup-api.md)
documents the planned SATP reputation/evidence lookup boundary.

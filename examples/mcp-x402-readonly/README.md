# SATP MCP/x402 read-only runtime example

This example is a repo-owned, offline-first sketch for exposing SATP read APIs through an MCP-style tool surface with a mock x402 verifier.

For the shortest external-builder snippets, including separate MCP,
A2A/agent-runtime, and x402 paid-endpoint quickstarts, see
[`../../docs/adoption-quickstarts.md`](../../docs/adoption-quickstarts.md).

It is intentionally **offline, fixture-first, and read-only by default**:

- fixture data is used unless `mode: "rpc"` is requested;
- RPC reads require both `SATP_EXAMPLE_ALLOW_RPC=1` and `rpcOptIn: { enabled: true, readOnly: true }`;
- the RPC branch performs account-info lookup only and rejects signing, transaction, or write opt-ins;
- it never signs transactions, sends transactions, reads keypairs, charges money, deploys programs, or publishes packages;
- x402 behavior is represented by a mock verifier interface only.

## Tools exposed

The server in `src/server.js` exposes three read-only tools:

| Tool | Purpose |
| --- | --- |
| `satp.getPrograms({ network })` | Return SATP v3 program IDs for `devnet` or `mainnet`. |
| `satp.resolveIdentity({ wallet, network, mode, rpcOptIn })` | Resolve a wallet from local fixtures by default; optional read-only RPC lookup requires `SATP_EXAMPLE_ALLOW_RPC=1` and `rpcOptIn: { enabled: true, readOnly: true }`. |
| `satp.prepareAttestationRequest({ subjectWallet, claimType, metadataHash })` | Prepare a validated read-only SATP trust packet with unsigned request metadata, program IDs, Genesis PDA, attestation PDA, and no-sign/no-transaction flags. |
| `satp.getConformanceFixtures()` | Return the offline SATP conformance fixture manifest for local runtime checks. |
| `satp.evaluateProtectedToolPolicy({ toolName, operatorApproved })` | Example MCP protected-tool policy decision using `createRuntimePolicyAdapter`. |
| `satp.evaluateX402EndpointPolicy({ actionPaymentPreapproved })` | Example x402 paid-endpoint policy decision using `createRuntimePolicyAdapter` without live payment. |

## Usage

```bash
npm --prefix examples/mcp-x402-readonly test
npm --prefix examples/mcp-x402-readonly run check
```

Example call from Node:

```js
const { createSatpMcpX402Server } = require('./src/server');

const server = createSatpMcpX402Server();
const response = await server.callTool(
  'satp.getPrograms',
  { network: 'devnet' },
  { headers: { 'x-402-fixture': 'satp-fixture-pass' } }
);
console.log(response.result);
```

Protected MCP tool policy example:

```js
const { buildMcpProtectedToolPolicyExample } = require('./src/runtimePolicyExamples');

const policy = buildMcpProtectedToolPolicyExample({
  toolName: 'satp.getPrograms',
  operatorApproved: true,
});

console.log(policy.result.decision, policy.result.reasonCodes);
```

x402 paid endpoint policy example:

```js
const { buildX402PaidEndpointPolicyExample } = require('./src/runtimePolicyExamples');

const policy = buildX402PaidEndpointPolicyExample({
  actionPaymentPreapproved: false,
});

console.log(policy.result.decision, policy.paymentBoundary.paymentIsNotActionAuthorization);
```

## Optional read-only RPC

Fixture mode is the default and should be used for tests and examples. If a maintainer wants to demonstrate a live account lookup without writes:

```bash
SATP_EXAMPLE_ALLOW_RPC=1 node -e "const {createSatpReadonlyRuntime}=require('./examples/mcp-x402-readonly/src/satpReadonly'); createSatpReadonlyRuntime().resolveIdentity({wallet:'7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',mode:'rpc',rpcOptIn:{enabled:true,readOnly:true}}).then(console.log)"
```

This performs a read-only account lookup. It does not create identities, submit attestations, sign, read keypairs, send any transaction, mutate chain state, deploy, publish packages, perform paid spend, launch publicly, mutate DNS/GitHub-org/admin settings, or perform client/business/Masthead work.

## Scope guardrails

This example is code-only and branch/PR-scoped. It does not perform npm package publication, Solana mainnet/devnet writes, keypair reads/use/movement/change, deploys, production mutation, public launch, Masthead work, or client work.

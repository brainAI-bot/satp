# SATP MCP/x402 read-only runtime example

This example is a repo-owned, offline-first sketch for exposing SATP read APIs through an MCP-style tool surface with a mock x402 verifier.

It is intentionally **read-only by default**:

- fixture data is used unless `mode: "rpc"` is requested;
- RPC reads are disabled unless `SATP_EXAMPLE_ALLOW_RPC=1` is set;
- it never signs transactions, sends transactions, reads keypairs, charges money, deploys programs, or publishes packages;
- x402 behavior is represented by a mock verifier interface only.

## Tools exposed

The server in `src/server.js` exposes three read-only tools:

| Tool | Conformance | Purpose |
| --- | --- |
| satp.getPrograms({ network }) | SATP-C1 | Return SATP v3 program IDs for devnet or mainnet. |
| satp.resolveIdentity({ wallet, network, mode }) | SATP-C1 | Resolve a wallet from local fixtures by default; optional read-only RPC lookup requires SATP_EXAMPLE_ALLOW_RPC=1. |
| satp.prepareAttestationRequest({ subjectWallet, claimType, metadataHash }) | SATP-C2 | Prepare unsigned attestation request metadata and deterministic PDAs. |

Compatibility levels are defined in docs/conformance.md. This example must stay
below SATP-C3: it does not build, sign, or submit write transactions.

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

## Optional read-only RPC

Fixture mode is the default and should be used for tests and examples. If a maintainer wants to demonstrate a live account lookup without writes:

```bash
SATP_EXAMPLE_ALLOW_RPC=1 node -e "const {createSatpReadonlyRuntime}=require('./examples/mcp-x402-readonly/src/satpReadonly'); createSatpReadonlyRuntime().resolveIdentity({wallet:'7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',mode:'rpc'}).then(console.log)"
```

This performs a read-only account lookup. It does not create identities, submit attestations, or send any transaction.

## Scope guardrails

This example is code-only and branch/PR-scoped. It does not perform npm package publication, Solana mainnet/devnet writes, keypair reads/use/movement/change, deploys, production mutation, public launch, Masthead work, or client work.

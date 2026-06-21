# SATP MCP integration notes

SATP's repo-owned MCP/x402 runtime example lives at:

```text
examples/mcp-x402-readonly/
```

Use that example as the in-repo reference for fixture-first SATP MCP tool behavior. It exposes:

- `satp.getPrograms({ network })`
- `satp.resolveIdentity({ wallet, network, mode })`
- `satp.prepareAttestationRequest({ subjectWallet, claimType, metadataHash })`, which returns a read-only SATP trust packet built by `buildSatpTrustPacket`

The example is intentionally read-only by default. It uses fixtures unless `mode: "rpc"` is requested and `SATP_EXAMPLE_ALLOW_RPC=1` is explicitly set. It does not sign, send transactions, read keypairs, deploy programs, publish packages, charge payments, mutate production, or depend on any consumer app as the SATP source of truth.

Run it with:

```bash
npm --prefix examples/mcp-x402-readonly test
npm --prefix examples/mcp-x402-readonly run check
```

## External AgentFolio context

Earlier MCP notes referenced the AgentFolio-hosted package and public SSE endpoint (`@agentfolio/mcp`, `https://agentfolio.bot/mcp/sse`, and `https://agentfolio.bot/api/satp`). Those are **external consumer context**, not the canonical SATP repo-owned runtime surface.

AgentFolio may continue to consume SATP through its own integration layer, but SATP-owned examples should remain app-agnostic, fixture-first, and safe to run without credentials or chain writes.

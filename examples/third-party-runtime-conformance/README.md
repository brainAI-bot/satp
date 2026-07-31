# SATP third-party runtime conformance example

This example shows how a third-party app can verify SATP identity,
attestation, and trust packet records from the repo-owned conformance fixtures
without AgentFolio infrastructure.

For a shorter copy-paste A2A/agent-runtime quickstart, see
[`../../docs/adoption-quickstarts.md`](../../docs/adoption-quickstarts.md).

It is intentionally offline and app-agnostic:

- fixture records are loaded from `tests/conformance/fixtures`;
- verification uses SATP SDK helpers and deterministic PDA/hash checks;
- no AgentFolio API, AgentFolio database schema, live RPC, signer, keypair,
  transaction, x402 payment, deploy, or package publish path is required.

## Usage

```bash
npm --prefix examples/third-party-runtime-conformance test
npm --prefix examples/third-party-runtime-conformance run check
```

Example:

```js
const { createThirdPartySatpRuntime } = require('./src/runtimeVerifier');

const runtime = createThirdPartySatpRuntime();
const identity = runtime.loadFixture('identity-positive.json').record;
const attestation = runtime.loadFixture('attestation-positive.json').record;
const trustPacket = runtime.loadFixture('trust-packet-positive.json').record.packet;

const result = runtime.verifyBundle({ identity, attestation, trustPacket });
console.log(result.ok, result.boundary.agentFolioRuntimeRequired);
```

## Consumer boundary

The example treats the consuming app as a generic runtime named
`third-party-runtime-conformance`. The app may store or display SATP records,
but SATP owns protocol validation, PDA derivation, identity-attestation request
shape, and trust packet verification.

```text
third-party app fixture input
  -> SATP runtime verifier
  -> identity, attestation, and trust packet verdicts
  -> read-only app decision
```

Any write path, signing flow, live Solana lookup, or product adapter belongs in
a separate reviewed integration.

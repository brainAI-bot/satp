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

// These expectations come from the host's request and the artifact it holds,
// not from the untrusted attestation record being verified.
const result = runtime.verifyBundle(
  { identity, attestation, trustPacket },
  {
    expectedSubject: 'rc-s6-fixture-agent',
    expectedEvidenceDigest: '414f0c9b1ded7a0636e2215c93d37b91c247592f4319d3ff302cd1085bbac710',
    expectedEvidenceUri: 'urn:satp:attestation:8z8Kd729S2kqtXGjLFczXVpGTyqy7rHpEKbWaHb5zZFv',
  }
);
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

## Interoperability verifier fixtures

The `tests/conformance/fixtures/interop-verifier-v0` slice turns the latest
issue #14 identity-continuity and publication signals into deterministic,
offline checks:

- `verifyInteropSessionIdentity` keeps the provider-authoritative stable agent
  ID, session/execution ID, transport connection, persisted link, and outcome
  receipt separate. Concurrent sessions for one agent remain valid, while a
  reused session or transport identity returns `session_conflict`; an ambiguous
  legacy record without a provider identity returns `identity_unknown`.
- `verifyPublishedIdentityArtifact` reports `subjectBindingValid`,
  `publicationAuthorized`, and `freshnessValid` independently. A runtime-bound
  artifact does not authorize an unrelated publisher, and control of an HTTPS
  origin does not make stale content current.

These are compatibility fixtures derived from public protocol and bug-report
signals. They do not claim an integration, partnership, or finalized standard,
and they do not perform discovery, network access, signing, or writes.

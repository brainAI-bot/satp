# AgentFolio SATP consumer read-only example

This example shows how an AgentFolio-style consumer can prepare SATP identity and trust inputs from app-owned profile data without owning SATP protocol logic.

It uses the SATP client package helper `prepareIdentityAttestationRequest` to derive deterministic unsigned identity-attestation request metadata. The output is suitable for:

- an AgentFolio adapter that wants to display or queue SATP trust inputs while staying consumer-only;
- an MCP tool that returns prepared SATP records from fixture or read-only data;
- an x402 gate that controls access before returning the same read-only record.

The example does not sign, send transactions, read keypairs, call RPC, publish packages, deploy programs, mutate AgentFolio production data, or perform live x402 payment handling.

## Usage

```bash
npm --prefix examples/agentfolio-consumer-readonly test
npm --prefix examples/agentfolio-consumer-readonly run check
```

Example:

```js
const profile = require('./fixtures/agentfolio-profile.json');
const {
  buildAgentFolioSatpConsumerRecord,
  verifyAgentFolioSatpConsumerRecord,
} = require('./src/consumerRecord');

const record = buildAgentFolioSatpConsumerRecord({ profile, network: 'devnet' });
const verification = verifyAgentFolioSatpConsumerRecord(record);

console.log(verification.ok, record.satp.trustInputs.map((input) => input.request.attestationPda));
```

## Consumer boundary

AgentFolio owns product profile data and display. SATP owns program IDs, PDA derivation, identity-attestation request shape, and later transaction construction. This example keeps that boundary explicit by importing SATP helpers from the repo package and returning only unsigned metadata:

```text
AgentFolio fixture profile
  -> consumer adapter
  -> SATP prepareIdentityAttestationRequest
  -> unsigned request metadata for display, review, MCP, or x402-gated read access
```

Any future write path must be implemented outside this read-only runtime and reviewed as a separate branch/PR.

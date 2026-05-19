# SATP conformance

This document defines the compatibility levels used by SATP examples and
consumer checks. A consumer should claim the highest level it satisfies without
depending on AgentFolio internals, private keys, deployment state, or live
payments.

## Compatibility levels

| Level | Name | Required behavior |
| --- | --- | --- |
| SATP-C0 | Reference only | Reads SATP documentation, IDLs, or fixtures. Does not expose a runtime API. |
| SATP-C1 | Read-only discovery | Resolves public SATP program IDs, reads or fixture-resolves identities, validates inputs before lookup, and performs no signing or writes. |
| SATP-C2 | Unsigned attestation preflight | Prepares deterministic unsigned SATP request metadata, including metadata hashes, program IDs, PDAs, and request hashes. It must not build, sign, or submit transactions. |
| SATP-C3 | Write-capable integration | Builds SATP write transactions from reviewed request metadata and signs or submits them through an approved integration boundary. This level is out of scope for the current read-only examples. |
| SATP-C4 | Authority or deployment integration | Changes SATP program deployment, upgrade authority, key custody, package publishing, or protocol semantics. This requires separate release and security approval. |

## Current repo-owned examples

### MCP/x402 read-only example

examples/mcp-x402-readonly/ is a SATP-C1 runtime for:

- satp.getPrograms({ network })
- satp.resolveIdentity({ wallet, network, mode })

It is also SATP-C2 for:

- satp.prepareAttestationRequest({ subjectWallet, claimType, metadataHash })

The x402 gate in this example is fixture-only. It may allow or deny a read-only
tool response, but it does not collect live payment, read keypairs, sign
transactions, send transactions, deploy programs, publish packages, or mutate
production state.

### AgentFolio consumer read-only example

examples/agentfolio-consumer-readonly/ is SATP-C2. It starts from
AgentFolio-style profile data, derives unsigned SATP trust-input requests
through the SATP client package, and verifies hashes, PDAs, program IDs, and
read-only flags before the record is treated as valid.

AgentFolio remains a consumer. It owns product profile data and display, while
SATP owns program IDs, PDA derivation, request shape, and protocol semantics.

## Conformance check

Run the offline conformance check with:

    npm run check:conformance

The check covers:

- the conformance language in this document;
- MCP/x402 tool conformance metadata and read-only behavior;
- AgentFolio consumer conformance metadata and unsigned request verification.

The check does not contact Solana RPC, sign transactions, send transactions,
read keypairs, deploy programs, publish packages, charge payments, or mutate
AgentFolio production data.

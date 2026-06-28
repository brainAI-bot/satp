# SATP Client

@brainai/satp-client is the JavaScript/TypeScript SDK surface for SATP
identity, reputation, attestation, validation, review, and escrow helpers.

## Install Path

Choose the dependency source by release channel:

| Channel | Use when | Dependency |
| --- | --- | --- |
| Stable npm | Production or default consumer installs that should follow the public stable package. | `npm install @brainai/satp-client@2.0.1` or `npm install @brainai/satp-client` |
| Release candidate npm | Downstream apps are validating the reviewed rc package metadata or need reproducible rc manifests before promotion. | `npm install @brainai/satp-client@2.0.2-rc.0` or opt in to `npm install @brainai/satp-client@rc` |
| Reviewed Git commit | PR coordination or unpublished review work where the exact repository commit is the artifact under review. | `git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>` |

The npm `latest` tag still resolves to `@brainai/satp-client@2.0.1`.
Historical rc-tag readback may still show the older `0.1.0-rc.0` package until
the rc channel is promoted. The reviewed RC-S6 artifact in this source tree is
`@brainai/satp-client@2.0.2-rc.0`; downstream apps that need reproducible
manifests should pin that exact version after promotion instead of depending on
the moving `rc` dist-tag.

Stable consumers can pin the current published npm package:

    {
      "dependencies": {
        "@brainai/satp-client": "2.0.1"
      }
    }

For rc validation, pin the exact rc package when the downstream lockfile is the
auditable artifact:

    {
      "dependencies": {
        "@brainai/satp-client": "2.0.2-rc.0"
      }
    }

For branch-only development or PR review, pin a reviewed SATP Git commit:

    {
      "dependencies": {
        "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>"
      }
    }

The Git review package root is intentionally named @brainai/satp-client,
remains private: true, and exposes packages/satp-client/src/index.js plus
packages/satp-client/src/index.d.ts through the package exports map. Do not
treat a branch-only Git dependency as npm latest.

## API Surface

    const {
      SATPSDK,
      SATPV3SDK,
      createSATPClient,
      getV3ProgramIds,
      hashAgentId,
      getGenesisPDA,
      prepareIdentityAttestationRequest,
      buildSatpTrustPacket,
      validateSatpTrustPacket,
    } = require('@brainai/satp-client');

Subpath imports under @brainai/satp-client/src/* remain available for existing
consumers during the review phase.

## Read-only Trust Packets

`buildSatpTrustPacket(opts)` derives a deterministic SATP trust packet for
consumer preflight. It wraps the unsigned identity-attestation request with the
program IDs, Genesis PDA, attestation PDA, request hash, and explicit flags that
show no signer, transaction, RPC write, live x402 payment, or package publish is
required to display or queue the packet.

    const {
      buildSatpTrustPacket,
      validateSatpTrustPacket,
    } = require('@brainai/satp-client');

    const trustPacket = buildSatpTrustPacket({
      subjectWallet: '11111111111111111111111111111111',
      agentId: 'brainChain',
      claimType: 'identity',
      metadataHash: '93d122f8879fe87c186c10a00db8fbc80a73cecd2ede44b9ffa6410be3c2b805',
      network: 'devnet',
    });

    const validation = validateSatpTrustPacket(trustPacket);
    if (!validation.ok) throw new Error(validation.errors.join('; '));

The trust-packet shape uses `schemaVersion: 'satp.trustPacket.v1'`,
`packetType: 'satp-trust-packet'`, and
`mode: 'offline-readonly-trust-packet'`. `validateSatpTrustPacket(packet)`
fails closed when `packetType` is not exactly `satp-trust-packet`, when the
read-only flags are changed, or when PDA/request fields no longer match a
freshly derived packet.

## Verification

    npm install --ignore-scripts --no-audit --no-fund
    npm run ci

npm run ci validates committed IDLs, syntax-checks client sources, verifies the
public export surface, runs a clean external-consumer install smoke test, and
runs the offline SDK/Borsh tests.

RC-S6 conformance fixture planning is tracked in
`docs/conformance.md`. The current plan is fixture-first and offline; executable
conformance fixtures remain pending until assigned separately.

This package task does not publish to npm, deploy Solana programs, write to
mainnet/devnet, read or move keypairs, change AgentFolio product code, perform
client work, or make public announcements.

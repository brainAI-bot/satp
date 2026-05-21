# SATP Client

@brainai/satp-client is the JavaScript/TypeScript SDK surface for SATP
identity, reputation, attestation, validation, review, and escrow helpers.

## Install Path

Until the release packet passes, consumers should install from a reviewed SATP
Git commit instead of npm:

    {
      "dependencies": {
        "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>"
      }
    }

The package root is intentionally named @brainai/satp-client, remains
private: true, and exposes packages/satp-client/src/index.js plus
packages/satp-client/src/index.d.ts through the package exports map.

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

This package task does not publish to npm, deploy Solana programs, write to
mainnet/devnet, read or move keypairs, change AgentFolio product code, perform
client work, or make public announcements.

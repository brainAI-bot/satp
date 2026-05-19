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
    } = require('@brainai/satp-client');

Subpath imports under @brainai/satp-client/src/* remain available for existing
consumers during the review phase.

## Verification

    npm install --ignore-scripts --no-audit --no-fund
    npm run ci

npm run ci validates committed IDLs, syntax-checks client sources, verifies the
public export surface, runs a clean external-consumer install smoke test, and
runs the offline SDK/Borsh tests.

This package task does not publish to npm, deploy Solana programs, write to
mainnet/devnet, read or move keypairs, change AgentFolio product code, perform
client work, or make public announcements.

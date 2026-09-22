# Changelog

All notable changes to `@brainai/satp-client` are recorded here.

## 2.0.9 — Unreleased

- Prepare the current `main` package surface as a reviewed release candidate without publishing it or changing npm dist-tags.
- Include the SATP V3 escrow fee-routing builders, including full and partial release flows, in the packed SDK.
- Preserve the attestation-evidence, runtime-authorization-evidence, wallet-control-challenge, x402-discovery, source-module, IDL, and package-manifest exports in the npm artifact.
- Add a commit-bound release-preparation workflow that verifies the requested commit is on `main`, validates the dry-run pack file list, records `gitHead`, and exercises the packed artifact from a clean consumer.

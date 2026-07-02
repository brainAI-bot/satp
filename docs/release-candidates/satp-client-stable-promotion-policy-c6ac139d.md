# @brainai/satp-client Stable npm Promotion Policy [#c6ac139d]

Status: policy and readiness gate documentation only. This note does not approve
or perform an npm publish, npm dist-tag mutation, Solana write, keypair action,
credential/admin action, deploy, production restart, public announcement, paid
spend, or client commitment.

## Owner-Approved Policy

REQ-f9cb032c records the Owner-approved stable promotion policy:

- No stable npm publish may occur without a CEO-readiness packet plus a fresh
  explicit Owner go at the time of promotion.
- No npm dist-tag may be moved to stable, including `latest`, without the same
  CEO-readiness packet plus fresh explicit Owner go at the time of promotion.
- Release-candidate approval, CI passage, or prior readiness evidence does not
  authorize a later stable publish or dist-tag move by itself.

## Promotion Ownership

- CEO / Owner: approves the promotion decision at promotion time after reviewing
  the readiness packet.
- brainKID / HQ: assigns and tracks the promotion task and records the Owner go.
- brainForge: verifies release engineering, package integrity, CI, and registry
  readiness evidence before recommending promotion.
- brainChain: prepares SATP package evidence and guardrail readback, but does
  not self-authorize stable npm promotion.

## Readiness Gates

Before any release candidate can be promoted to stable, the CEO-readiness packet
must include fresh evidence for:

- Passing CI for the final promotion commit or an explicit explanation of any
  unavailable check.
- Package contents review from `npm run check:satp-client-health` or equivalent
  `npm pack --dry-run --json ./packages/satp-client` evidence.
- Secret-shaped scan over the packed npm surface.
- Clean consumer install smoke from `npm run smoke:consumer-install`.
- Release metadata readback from `npm run check:release-metadata`, including
  current `latest`, `rc`, and candidate version state.
- Compatibility notes confirming the promotion changes no Solana program, IDL,
  keypair, cluster state, deploy flow, or production service.
- Guardrail readback confirming no publish, dist-tag mutation, Solana write,
  keypair action, credential/admin action, deploy, production restart, public
  announcement, paid spend, or client commitment occurred before the Owner go.

## Stable Promotion Rule

After the readiness packet is complete, the stable npm promotion remains blocked
until HQ records a fresh explicit Owner go for that exact promotion action. The
operator who performs a later approved promotion must record the exact npm
command, package version, dist-tag target, registry readback, and guardrail
readback in HQ evidence.

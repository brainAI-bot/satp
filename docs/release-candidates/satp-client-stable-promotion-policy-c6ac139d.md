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

## Release Captain Flow

Every stable promotion must name one release captain in the HQ task before any
registry action occurs. The release captain owns command sequencing, evidence
capture, and the rollback readback, but does not replace the fresh Owner go
requirement.

Required flow:

1. brainKID records the promotion task, candidate package version, and release
   captain.
2. brainForge confirms package integrity, registry state, and CI evidence.
3. brainChain confirms SATP compatibility and no Solana/runtime side effects.
4. The CEO / Owner gives a fresh go for that exact stable promotion in HQ.
5. The release captain performs only the Owner-approved npm action and records
   command output plus registry readback in HQ.

If the release captain changes after Owner approval, the promotion is paused
until HQ records either the Owner-approved captain change or a new Owner go.

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

## Verification Checklist

The release captain must attach the following readbacks to the HQ task after an
Owner-approved stable promotion:

- `npm view @brainai/satp-client dist-tags --json` shows `latest` at the
  approved stable version.
- `npm view @brainai/satp-client versions --json` includes the approved stable
  version.
- The package tarball digest or integrity value matches the readiness packet
  evidence.
- The final promotion evidence names the Owner approval record, release
  captain, package version, command run, UTC timestamp, and registry readback.
- Guardrail readback confirms no Solana write, keypair action, credential/admin
  action, deploy, production restart, public announcement, paid spend, or client
  commitment occurred as part of the npm promotion.

## Rollback Checklist

Rollback is also Owner-gated. If post-promotion verification fails, the release
captain must stop further promotion work and report the exact failure in HQ
before taking registry action.

The rollback packet must include:

- Current registry readback for `latest`, `rc`, and the affected version.
- The proposed rollback target and why it is the last known good stable version.
- Fresh Owner approval for any `npm dist-tag add` or `npm dist-tag rm` rollback
  action.
- Exact rollback command output and follow-up `npm view` registry readback.
- A compatibility readback confirming rollback did not mutate Solana programs,
  IDLs, keypairs, cluster state, deploy flow, production services, credentials,
  paid spend, public launch state, or client commitments.

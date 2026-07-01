# SATP package naming decision [#b3e7e7ce]

Status: accepted for package guidance
Date: 2026-07-01

## Decision

SATP will use a phased umbrella/client split.

`@brainai/satp-client` remains the stable consumer install and import target
today. AgentFolio and other consumers should continue to target
`@brainai/satp-client` for stable npm installs, exact release-candidate
validation, or reviewed Git commit pins.

`@brainai/satp` is the long-term umbrella package name. It should become the
default package for new consumers only after a separate release gate approves a
public umbrella package, verifies its export compatibility, and publishes
install-ready docs. Until then, `@brainai/satp` stays a private workspace
entrypoint for PR review.

`@brainai/satp-client` will remain a supported compatibility package after the
umbrella package ships. Existing consumers should not be forced through a
rename-only migration, and package docs should keep explicit instructions for
the client package through the migration window.

## Current package and npm metadata inventory

| Surface | Current metadata | Consumer guidance |
| --- | --- | --- |
| Repository root package | `package.json` is named `@brainai/satp-client`, `private: true`, version `0.0.0-extraction`, with root exports pointing at `packages/satp-client/src/index.js` and `packages/satp-client/src/index.d.ts`. | Keep this shape for commit-addressed Git review installs only. It is not npm latest. |
| Client package | `packages/satp-client/package.json` is named `@brainai/satp-client`, version `2.0.2-rc.0`, `private: false`, and publishes under the `rc` tag if a future release gate authorizes publish. | This is the SDK source package and the current stable consumer package family. |
| npm `@brainai/satp-client` | Registry readback on 2026-07-01: `latest` is `2.0.1`, `rc` is `0.1.0-rc.0`, and published versions are `0.1.0-rc.0`, `2.0.0`, and `2.0.1`. | Stable consumers use `@brainai/satp-client@2.0.1` or `@brainai/satp-client`; rc validation should pin the reviewed rc artifact after promotion instead of relying on the moving `rc` tag. |
| Umbrella package | `packages/satp/package.json` is named `@brainai/satp`, `private: true`, version `0.0.0-extraction`, and depends on the client/core/Solana workspace surfaces. npm registry readback for `@brainai/satp` returned 404 on 2026-07-01. | Reserve as the long-term umbrella package. Do not tell consumers to install it until it is public and release-gated. |
| Core package | `packages/satp-core/package.json` is named `@brainai/satp-core`, `private: true`, version `0.0.0-extraction`. | Keep private until a separate package-boundary release decision approves public install docs. |
| Solana package | `packages/satp-solana/package.json` is named `@brainai/satp-solana`, `private: true`, version `0.0.0-extraction`. | Keep private until a separate package-boundary release decision approves public install docs. |

## Rationale

The client package already exists on npm, has stable consumers, and is the only
public SATP package with current registry metadata. Keeping it as the immediate
target avoids a breaking rename and lets AgentFolio use a known install path.

The umbrella name is still valuable because SATP is broader than one client SDK:
the repo already has client, core, and Solana workspace boundaries. Reserving
`@brainai/satp` for the future default gives new consumers a simpler long-term
brand package without pretending that the private extraction package is
install-ready today.

The phased split also lets release review prove the umbrella package as a normal
npm package before docs direct consumers to it. That release gate must verify
export compatibility, dependency metadata, clean consumer install behavior, and
backward-compatible migration notes.

## Migration and backward compatibility

Current consumers should make no package-name change. Stable installs stay on:

```json
{
  "dependencies": {
    "@brainai/satp-client": "2.0.1"
  }
}
```

Reviewed SATP branch or PR coordination may still use a commit-addressed Git
pin when HQ explicitly assigns that work:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>"
  }
}
```

After `@brainai/satp` is publicly released, new consumers may move to the
umbrella package only when docs are updated by a separate release PR. That PR
should keep `@brainai/satp-client` examples as the compatibility path and should
not remove client-package exports in the same change.

No migration step in this decision publishes npm packages, writes to Solana
devnet or mainnet, reads or moves keypairs, mutates credentials/admin settings,
deploys production, or changes AgentFolio product code.

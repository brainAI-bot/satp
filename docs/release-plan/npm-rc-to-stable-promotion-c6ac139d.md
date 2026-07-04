# SATP npm RC-to-Stable Promotion Plan [#c6ac139d]

Status: planning documentation only. This plan does not publish to npm, mutate
npm dist-tags, use or expose credentials, write Solana state, change keypairs,
deploy, restart production, spend funds, or change GitHub/DNS/org settings.

## Scope

The current source-controlled npm release candidate is
`@brainai/satp-client@2.0.2-rc.0` with `publishConfig.tag=rc`. Promotion to
stable means turning a validated RC packet into an npm `latest` release under a
separate, explicitly approved HQ release task.

This document covers `@brainai/satp-client` only. Workspace packages that remain
private or unpublished are not promoted unless a later release packet explicitly
adds them.

## Ownership Model

- Release captain: owns the HQ release task, final checklist, PR evidence, and
  go/no-go summary.
- SATP technical reviewer: confirms the package surface, conformance evidence,
  and source/tag alignment.
- npm credential holder: performs the actual `npm publish` or `npm dist-tag`
  mutation only after the release captain records approval in HQ.
- Observer/verifier: performs independent public-registry readback after the npm
  mutation and records the result.

No single person should both perform the npm write and be the only verifier.
The credential holder owns the npm account/session, but does not widen package
scope or dist-tag policy without a new HQ task.

## Promotion Path

1. Confirm the RC packet is still the intended candidate:

   ```sh
   git fetch origin main --tags
   git status --short --branch
   npm run check:release-metadata
   npm run check:satp-client-health
   npm run ci
   ```

2. Confirm public registry state without mutation:

   ```sh
   npm view @brainai/satp-client name version dist-tags versions --json
   ```

3. If the RC has not been published yet, publish the candidate to the `rc`
   dist-tag from a clean, reviewed commit:

   ```sh
   npm publish ./packages/satp-client --tag rc --access public
   ```

4. Verify the RC tarball and package entrypoints from a clean consumer install:

   ```sh
   npm view @brainai/satp-client@2.0.2-rc.0 dist.integrity dist.tarball --json
   npm install @brainai/satp-client@2.0.2-rc.0
   node -e "const satp=require('@brainai/satp-client'); console.log(Object.keys(satp).sort())"
   ```

5. Promote stable only after the release captain records go/no-go approval in
   HQ and the npm credential holder confirms they are operating in the intended
   registry/account:

   ```sh
   npm dist-tag add @brainai/satp-client@2.0.2-rc.0 latest
   ```

6. Keep the `rc` dist-tag on the same promoted version until the next RC line is
   opened. Do not delete `rc` during the stable promotion unless a later release
   task explicitly requests dist-tag cleanup.

## Release Verification Gates

- Git: promotion source commit is on the reviewed PR branch or merged `main`,
  with no uncommitted package changes.
- Metadata: `packages/satp-client/package.json` has `private:false`,
  `publishConfig.access:"public"`, and an RC prerelease version newer than the
  current npm `latest` before publish.
- Package surface: `npm pack --dry-run --json` includes only the expected SATP
  client files and no secret-shaped artifacts.
- Tests: release metadata, package health, JS checks, export checks, package
  entrypoint tests, smoke consumer install, conformance fixtures, wallet-control,
  x402 discovery, runtime policy, V3, and borsh tests pass.
- Registry: public readback shows `latest` points at the promoted stable version
  after promotion.
- Runtime: no Solana write, keypair action, deploy, restart, or production state
  change occurs as part of npm promotion.

## Rollback Path

If `latest` is moved to the wrong version but the package itself is intact,
restore the prior stable dist-tag:

```sh
npm dist-tag add @brainai/satp-client@<prior-stable-version> latest
npm dist-tag ls @brainai/satp-client
```

If a published tarball is defective, do not unpublish unless npm policy and HQ
approval explicitly require it. Instead:

1. Restore `latest` to the prior stable version.
2. Open a new HQ release task for the fix.
3. Publish a new patch RC with `--tag rc`.
4. Re-run the full promotion gates before any new `latest` mutation.

## Approval and Credential Boundary

This plan requires no Hani approval to merge as documentation. A future npm
write requires a separate HQ release task that names the credentialed npm
maintainer, the exact package version, the intended dist-tag mutation, and the
rollback version. That future task is the approval boundary; this PR is not
authorization to publish or promote.

Credentials must stay in the npm maintainer's local/approved secret store. They
must not be pasted into HQ, committed, printed in logs, shared in chat, or used
for any package outside the approved release task.

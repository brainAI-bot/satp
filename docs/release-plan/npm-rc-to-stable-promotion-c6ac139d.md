# SATP npm RC-to-Stable Promotion Plan [#c6ac139d]

Status: historical planning documentation only. This plan does not publish to
npm, mutate npm dist-tags, use or expose credentials, write Solana state, change
keypairs, deploy, restart production, spend funds, or change GitHub/DNS/org
settings.

Historical readback: the 2.0.2 release-candidate line has already been
superseded. Registry readback on 2026-07-26 shows npm `latest` at
`@brainai/satp-client@2.0.3` and the `rc` dist-tag at `2.0.2`. HQ task
`TASK-cc897dc9` records the Owner-approved 2.0.3 npm closeout, and
`TASK-f53c7ecb` records source alignment via PR #107. Do not use this document
to move `latest` back to `2.0.2`, `2.0.2-rc.0`, or any other superseded
artifact.

## Scope

This document originally described the now-superseded
`@brainai/satp-client@2.0.2-rc.0` candidate. Future stable promotion work must
start from a fresh HQ release task that names the exact candidate version,
current npm dist-tag state, release captain, credential holder, rollback target,
and Owner approval record. Promotion means turning that validated candidate into
an npm `latest` release under that separate, explicitly approved HQ task.

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

1. Confirm the HQ release task names the intended candidate and that the
   candidate is not older than the current npm `latest`:

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

3. If the candidate has not been published yet, publish it to the assigned
   pre-stable dist-tag from a clean, reviewed commit:

   ```sh
   npm publish ./packages/satp-client --tag <approved-prestable-tag> --access public
   ```

4. Verify the candidate tarball and package entrypoints from a clean consumer
   install:

   ```sh
   npm view @brainai/satp-client@<approved-candidate-version> dist.integrity dist.tarball --json
   npm install @brainai/satp-client@<approved-candidate-version>
   node -e "const satp=require('@brainai/satp-client'); console.log(Object.keys(satp).sort())"
   ```

5. Promote stable only after the release captain records go/no-go approval in
   HQ and the npm credential holder confirms they are operating in the intended
   registry/account:

   ```sh
   npm dist-tag add @brainai/satp-client@<approved-candidate-version> latest
   ```

6. Keep the `rc` dist-tag on the same promoted version until the next RC line is
   opened. Do not delete `rc` during the stable promotion unless a later release
   task explicitly requests dist-tag cleanup.

## Release Verification Gates

- Git: promotion source commit is on the reviewed PR branch or merged `main`,
  with no uncommitted package changes.
- Metadata: `packages/satp-client/package.json` has `private:false`,
  `publishConfig.access:"public"`, matches the exact HQ-approved candidate
  version, and cannot move npm `latest` backward from current registry state.
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

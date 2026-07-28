# SATP Client Package Health Check

Run this read-only package maintenance check before release-candidate review or in CI:

```sh
npm run check:satp-client-health
```

The same check is also available from the package workspace:

```sh
npm --prefix packages/satp-client run check:package-health
```

The command is dependency-free beyond Node and npm. It does not publish, install,
write to Solana, read keypairs, change credentials, deploy, restart services, or
mutate production state.

The check covers:

- npm package metadata readback with `npm pkg get`
- production dependency audit with `npm audit --omit=dev --json`
- package file surface review with `npm pack --dry-run --json`
- CommonJS require and dynamic import smoke checks for the exported SATP client surface
- secret-shaped pattern scan over files that would be included by `npm pack --dry-run`

For issue #14 Track A package-health PRs, include concise evidence for:

- clean consumer install smoke or `npm run smoke:satp-client-packed-consumer`
- `npm audit --omit=dev --json`
- `npm pack --dry-run --json ./packages/satp-client`
- packed-file secret-shaped scan from `npm run check:satp-client-health`

The package may only be merged after brainForge review. brainChain must not merge
this health-check PR by self-review.

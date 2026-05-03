# SATP Client consumer install path

`@brainai/satp-client` is delivered from the SATP repository without publishing
to npm. The durable/merge-safe path is a commit-addressed Git dependency on the
SATP repository root. The root package is intentionally named
`@brainai/satp-client` and its `main` points at the extracted client package
entrypoint in `packages/satp-client/src/index.js`.

## Durable dependency path for AgentFolio

Use a commit-addressed Git dependency:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<SATP_COMMIT>"
  }
}
```

For this branch update, replace `<SATP_COMMIT>` with the reviewed SATP commit
hash from PR #5. Example after this task is pushed:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#<task-2dfc2845-commit>"
  }
}
```

The branch form below is acceptable for active PR coordination, but the final
merge-safe dependency should pin a commit hash:

```json
{
  "dependencies": {
    "@brainai/satp-client": "git+https://github.com/brainAI-bot/satp.git#brainchain/satp-extract-001"
  }
}
```

## Why this is durable and merge-safe

- It does not depend on a sibling checkout or local tarball path.
- It does not require npm publish.
- npm can install it from a clean external consumer using only GitHub access.
- Pinning a commit makes the dependency immutable and reviewable in the consumer
  lockfile.
- The SATP repo root remains `private: true`, so the package is installable from
  Git for branch/PR use but not accidentally publishable to npm.

## Verification from a clean consumer

```bash
npm install --ignore-scripts --no-audit --no-fund
node - <<'NODE'
console.log(require.resolve('@brainai/satp-client'));
const satp = require('@brainai/satp-client');
for (const key of ['SATPSDK', 'SATPV3SDK', 'createSATPClient']) {
  if (!(key in satp)) throw new Error(`missing export ${key}`);
}
console.log('satp client dependency path ok');
NODE
```

Expected result: `require.resolve('@brainai/satp-client')` resolves under the
consumer `node_modules/@brainai/satp-client`, and the package exposes
`SATPSDK`, `SATPV3SDK`, and `createSATPClient`.

## Tarball fallback for local debugging only

A local tarball can still be produced for isolated debugging:

```bash
npm run pack:satp-client
npm install --ignore-scripts --no-audit --no-fund ../satp/dist/brainai-satp-client-0.0.0-extraction.tgz
```

Do not use the local tarball path as the merge dependency in AgentFolio.

## Rollback notes

Remove the Git dependency from the consumer package manifest and reinstall:

```bash
npm uninstall @brainai/satp-client
rm -rf node_modules package-lock.json
npm install --ignore-scripts --no-audit --no-fund
```

No npm publish, Solana deploy, keypair action, mainnet/devnet write,
AgentFolio product code change, Masthead work, client work, or public launch is
part of this install path.

# SATP Client consumer install path

`@brainai/satp-client` is currently delivered from this SATP branch/PR without
publishing to npm. Consumers should install the package tarball generated from
`packages/satp-client`; do not install the SATP repo root as the dependency,
because the root package is the private extraction workspace
`@brainai/satp-monorepo`.

## Dependency path for AgentFolio

From a checkout of this SATP branch:

```bash
git fetch origin brainchain/satp-extract-001
git switch brainchain/satp-extract-001
npm run pack:satp-client
```

This creates:

```text
dist/brainai-satp-client-0.0.0-extraction.tgz
```

In the external consumer, use the generated tarball as the dependency path:

```json
{
  "dependencies": {
    "@brainai/satp-client": "file:../satp/dist/brainai-satp-client-0.0.0-extraction.tgz"
  }
}
```

Adjust `../satp/` to the relative path from the consumer repo to the SATP
checkout. Equivalent one-off install command:

```bash
npm install --ignore-scripts --no-audit --no-fund ../satp/dist/brainai-satp-client-0.0.0-extraction.tgz
```

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

## Rollback notes

Remove the tarball dependency from the consumer package manifest and reinstall:

```bash
npm uninstall @brainai/satp-client
rm -rf node_modules package-lock.json
npm install --ignore-scripts --no-audit --no-fund
```

No npm publish, Solana deploy, keypair action, mainnet/devnet write,
AgentFolio product code change, Masthead work, client work, or public launch is
part of this install path.

# SATP V3 IDL Generation

Marker: [#c5634a2c]

The committed V3 IDLs live under `idls/v3/` and are generated from the extracted
Anchor source in `programs/*_v3`.

Source commit:

`brainAI-bot/clawd-brainchain/satp-v3@94a1d309dcc692228c357f6e28ab679196235ad2`

Generation command:

```sh
node scripts/generate-v3-idls.mjs
```

Verification command:

```sh
npm run validate:idls
```

`validate:idls` parses every committed IDL JSON file and then runs
`node scripts/generate-v3-idls.mjs --check`, which regenerates each V3 IDL from
the local Anchor source and fails if any committed file under `idls/v3/` differs.

This proof is offline and source-only. It does not deploy, write to Solana,
create or move keypairs, publish npm packages, restart production, perform admin
actions, spend funds, or announce publicly.

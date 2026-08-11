# SATP V3 IDL Generation

Marker: [#c5634a2c]

The committed V3 IDLs live under `idls/v3/` and are generated from the extracted
Anchor source in `programs/*_v3`.

Original extraction source (lineage only; not proof of either deployed binary):

`brainAI-bot/clawd-brainchain/satp-v3@94a1d309dcc692228c357f6e28ab679196235ad2`

`escrow_v3` has additional repository and deployment provenance after that
extraction. See [`escrow-v3-idl-provenance.md`](escrow-v3-idl-provenance.md) for
the checked-in source boundary, cluster-specific deployed readback, and callable
instruction subsets.

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

## Post-Merge Cleanup Readback

Marker: [#3faa5445] [#c5634a2c]

After the V3 source and generated-IDL PRs landed, `idls/v3/` is the canonical
V3 IDL tree. The root `idls/*.json`, `idls/agentfolio-current/*.json`, and
`idls/devnet-backup/*.json` files remain compatibility and historical readback
copies; they are parsed by `npm run validate:idls` but are not regenerated from
the V3 Anchor source.

Current committed generated-IDL readback:

| Program | Generated IDL | Stable SHA-256 |
| --- | --- | --- |
| identity_v3 | `idls/v3/identity_v3.json` | `07f1328cb1a751214f7f08953604d6259bd8e840c4a9512a2a31bd933ac129c0` |
| reviews_v3 | `idls/v3/reviews_v3.json` | `efa488f403224c89322461d20795047c166a51f8c2ae7766930636981d0e4f1a` |
| attestations_v3 | `idls/v3/attestations_v3.json` | `36eb0af13b51d80a8d16c09cd43e92dfcdd3212bd05cce4a54daef3456292034` |
| reputation_v3 | `idls/v3/reputation_v3.json` | `3632cc676beacce3f8963022cc8940b543384d0b8b3ce1c6e36b3647d7de0101` |
| validation_v3 | `idls/v3/validation_v3.json` | `29e4973d1504b4e7a273a212655d08e288b90ac7abb54f6917315e424bee6557` |
| escrow_v3 | `idls/v3/escrow_v3.json` | `3382cd7e7e89130a132418004da23bb2edca65793f994262112168dabbc2d576` |

This proof is offline and source-only. It does not deploy, write to Solana,
create or move keypairs, publish npm packages, restart production, perform admin
actions, spend funds, or announce publicly.

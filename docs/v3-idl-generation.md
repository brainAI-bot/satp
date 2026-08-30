# SATP V3 IDL Generation

Marker: [#c5634a2c]

The deployed-canonical V3 IDLs live under `idls/v3/`. Five IDLs are generated
from the checked-out Anchor source in `programs/*_v3`. Escrow is the explicit
exception: `idls/v3/escrow_v3.json` is pinned to the verified deployed-source
commit, while the checked-out escrow source is generated to
`idls/source-head/escrow_v3.json`.

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
`node scripts/generate-v3-idls.mjs --check`. The check regenerates five current
V3 IDLs under `idls/v3/` and the current escrow source-head IDL under
`idls/source-head/`. The separate deployed-truth verifier pins the canonical
escrow IDL to its byte-matched source commit.

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
| escrow_v3 deployed canonical | `idls/v3/escrow_v3.json` | `e8c142f27e225d8edc2f8f41e6fb698ebbb73f69d2fc078d5bf963234ebc8fa9` |
| escrow_v3 current source head | `idls/source-head/escrow_v3.json` | `9bb7e2a441af653108b21360a8aa14daa9bd8d54eebbc5eef88e7f3de881ba10` |

The escrow deployed-truth proof additionally performs a read-only mainnet
ProgramData comparison; it never submits a transaction. These checks do not
deploy, write to Solana,
create or move keypairs, publish npm packages, restart production, perform admin
actions, spend funds, or announce publicly.

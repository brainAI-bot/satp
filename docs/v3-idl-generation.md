# SATP V3 IDL Generation

Marker: [#c5634a2c]

The deployed-canonical V3 IDLs live under `idls/v3/` and are generated from the
checked-out Anchor source. Escrow is additionally pinned by the deployed-truth
packet to source commit `3f8188bec89db0d4a081931f35272e10185d1c0d`, whose
reproducible SBF artifact matches the current mainnet ProgramData prefix.

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

`node scripts/generate-v3-idls.mjs --check`. The check regenerates all six
current V3 IDLs under `idls/v3/` and fails if any committed file differs.
`npm run check:v3-idl-program-metadata` verifies the committed Anchor 1.0 IDL
program metadata against `Anchor.toml` and the SDK consumer program ID exports
without contacting Solana or writing chain state.
The separate deployed-truth verifier pins the canonical escrow IDL to its
byte-matched source commit and keeps stale on-chain IDL publication surfaces
fail-closed.

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
| identity_v3 | `idls/v3/identity_v3.json` | `9b8dcf2abe2ff35c022ef7d843b2fd76d39371966e39d01e1910cba8a6598536` |
| reviews_v3 | `idls/v3/reviews_v3.json` | `973637173bde464cce8065bbf915bc471ca9af34ba7d4c7c3d1942293bc1ad3e` |
| attestations_v3 | `idls/v3/attestations_v3.json` | `7238bf3762b391cebb797a9ed87fcfb581f1d5a3b1663b116f4089ea6ea16b52` |
| reputation_v3 | `idls/v3/reputation_v3.json` | `f693ef8eb55d1317f4befe6a1a968123d15a95a3c9087cf2b75b3da9c143a98e` |
| validation_v3 | `idls/v3/validation_v3.json` | `2d74392aae4b0bd1bcde8cfd0e4fafebb49728c2851f9372c493a7a9d1f47315` |
| escrow_v3 | `idls/v3/escrow_v3.json` | `bbaf387212fdbd2171469761a0f80c65f7aa8fedf1cbe93ac275efe545fc6dd6` |

The escrow deployed-truth proof additionally performs a read-only mainnet
ProgramData comparison; it never submits a transaction. These checks do not
deploy, write to Solana,
create or move keypairs, publish npm packages, restart production, perform admin
actions, spend funds, or announce publicly.

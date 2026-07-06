# SATP Escrow Replacement CI Build Proof

Marker: [#49e40f78]

Branch: `brainchain/agentfolio-escrow-replacement-49e40f78`
Proof commit under test: `a58f4f2`
Proof recorded: `2026-07-06 01:40 UTC`

This proof is for the replacement devnet escrow source slice added under
`programs/satp_escrow` and the committed IDL at `idls/satp_escrow.json`.

## Environment

- Node.js: `v25.9.0`
- npm: `11.12.1`
- HQ task: `SATP-ESCROW-CI-BUILD-PROOF-49e40f78-20260706-0126`

## Commands

The following commands were run from the repository root:

```sh
npm ci
npm run ci
npm run check:satp-client-health
npm run test:conformance:rc-s6
npm run pack:satp-client
shasum -a 256 dist/brainai-satp-client-2.0.2-rc.0.tgz
```

## Results

- `npm ci`: passed; 60 packages installed, 0 vulnerabilities.
- `npm run ci`: passed.
- `npm run check:satp-client-health`: passed.
- `npm run test:conformance:rc-s6`: passed; 12 offline conformance fixtures.
- `npm run pack:satp-client`: passed.

Escrow source and IDL verification from `npm run ci`:

```json
{
  "ok": true,
  "idl": "idls/satp_escrow.json",
  "idl_sha256": "a1c8209e023137fd0147457f1fa10cc57a7b707e91da63565a7ff20d82951c1b",
  "idl_stable_sha256": "c9e542b2d14bb378dc85ea93ed4e5fa22def233ba0f49b5385da7a22f796b539",
  "source_tree_sha256": "02aa08d6edd83e12e23d3672c550ac2b76c203d695aa31fc9f0b72c65c5f73a6",
  "program_id": "UpJ7jmUzHkQ7EdBKiBv3zq8Dr1fVh6GVWKa7nYtwQ22",
  "instructions": 6,
  "events": 5,
  "errors": 10
}
```

Packed artifact:

```text
dist/brainai-satp-client-2.0.2-rc.0.tgz
size: 52640 bytes
sha256: 1a0520deb0cf7a94a6e8d1e7b26e863da6bfcbc476a1135e5ae5183640e93d05
npm shasum: bdab6b1ee4dd9b5f2106bee8f0fced302e27507a
npm integrity: sha512-Mq7H+OaXWb62zKOuUjp0W5cfW6nJ5se6E36Z7s6NwGemeH6xXnlh3jMP8j2JaBkkwpVdl2RZGiWCNmnGijf+sA==
```

This proof did not deploy, publish, rotate keys, write to devnet/mainnet, or
touch AgentFolio product code.

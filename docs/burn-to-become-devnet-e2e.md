# Burn-to-Become Devnet E2E Proof

Marker: `[#fbc35f6e]`

This packet wires an executable devnet proof for the deployed `identity_v3`
program at `7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ`.

Default read-only plan:

```sh
npm run verify:burn-become-devnet-e2e -- --plan --json
```

Offline CI plan test:

```sh
npm run test:burn-become-devnet-e2e
```

Write-gated execution:

```sh
SATP_DEVNET_E2E_APPROVED=1 \
SATP_DEVNET_KEYPAIR=<redacted-devnet-keypair-path> \
npm run verify:burn-become-devnet-e2e -- --execute --json
```

Execution creates one temporary devnet identity, calls `burn_to_become`,
initializes the identity-scoped mint tracker, commits three successful
`record_mint` transactions, then simulates the fourth mint failure. It rotates
authority and simulates another `record_mint` against the same tracker to prove
the cap follows identity rather than wallet authority. It also simulates a
second `burn_to_become` with a different face mint and requires failure, proving
the identity-program soulbound/face-transfer boundary.

Guardrails:

- Devnet only.
- No mainnet write.
- No npm publish.
- No keypair mutation or secret output.
- No production deploy or restart.


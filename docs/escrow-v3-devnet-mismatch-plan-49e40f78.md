# Escrow V3 Devnet Mismatch No-Write Repair Plan

Marker: `[#49e40f78]`

Status: read-only diagnosis complete. This plan does not deploy, upgrade,
publish an IDL, rotate keys, or change program authority.

## Read-Only Evidence

| Item | Value |
| --- | --- |
| SATP source commit | `42cf9b39caa454fc39b5f2291c93a553a664562a` |
| Source path | `programs/escrow_v3` |
| Devnet program ID | `B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg` |
| Local build command | `cargo build-sbf --tools-version v1.52 --manifest-path programs/escrow_v3/Cargo.toml` |
| Local built artifact | `target/deploy/escrow_v3.so` |
| Local built artifact hash | `fe866c0f57586aa2aa88089fcc4ce7359050218a2519a7f8556718efcf27db31` |
| Devnet dump command | `solana program dump -u devnet B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg /tmp/escrow_v3-devnet.so` |
| Devnet dumped artifact hash | `9426908b0c3084f316fc963a9824bd6aad55c2487da22ffe213bbfa3b772f82b` |
| Devnet ProgramData | `7m4t1wqt26s5haqS1n2HsRNoewMvLnTbzPkfFGkpZDD5` |
| Devnet upgrade authority | `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc` |
| Devnet last deployed slot | `453440913` |
| Devnet data length | `290680 (0x46f78)` |
| Anchor devnet IDL fetch | `AccountNotFound: pubkey=FivN5ANqf55Js5THDVzYU7tjq8mYkjdSE6xawpTAa3Ni` |
| Offline source checks | `npm run verify:v3-program-sources` passed |
| Offline IDL checks | `npm run validate:idls` passed |

## Diagnosis

The checked-in escrow source and repository IDL are internally consistent for
offline use, but the current `programs/escrow_v3` build does not match the
bytes deployed at the devnet program ID above. The deployed devnet hash is
`9426908b...`, while the rebuilt source hash is `fe866c0f...`.

The Anchor IDL account derived for the devnet program ID is not fetchable from
devnet. Because the deployed bytes mismatch the current source and the devnet
IDL cannot be fetched, the current state does not prove
`source == deployed == IDL` for AgentFolio escrow consumption.

AgentFolio should therefore treat the devnet escrow program as unverified until
HQ authorizes one of the repair tracks below.

## No-Write Repair Plan

1. Keep AgentFolio escrow rebuild status gated as "unverified devnet escrow".
   The current source and checked-in IDL may be used for local/offline SDK
   tests, but must not be represented as matching the deployed devnet program.
2. Preserve the read-only evidence above in SATP docs and HQ task evidence so
   later repair work has the exact program ID, ProgramData account, deployed
   slot, authority, local hash, deployed hash, and missing IDL account.
3. Choose one future write-approved track in HQ:
   - Replacement track: explicitly approve a devnet write task to deploy or
     upgrade `programs/escrow_v3` from the current source, publish the matching
     Anchor IDL, then rerun the same dump/hash/IDL fetch proof.
   - Recovery track: locate the exact source and IDL that produced the current
     devnet hash `9426908b...`, commit or archive that evidence, and rerun the
     same proof against the deployed program without writing to devnet.
4. Before any future write, require an HQ task naming the intended program ID,
   signer/authority owner, deploy command, IDL publish command, rollback path,
   and post-write proof commands. No implicit signer or keypair discovery should
   be used.
5. After an approved repair, accept the program only when all of these pass:
   source rebuild hash equals devnet dump hash; Anchor IDL fetch succeeds; the
   fetched IDL hash equals the canonical checked-in IDL; `npm run
   verify:v3-program-sources` passes; `npm run validate:idls` passes.

## Stop Condition

This task stops at diagnosis and no-write repair planning. No deploy, upgrade,
IDL publish, keypair action, authority change, or AgentFolio architecture change
is authorized by this document.

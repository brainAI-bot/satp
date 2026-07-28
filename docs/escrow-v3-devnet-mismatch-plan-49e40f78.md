# Escrow V3 Canonical ID Build Comparison and Former Devnet Mismatch Plan

Marker: `[#49e40f78]`

Status: 2026-07-28 owner decision selected the mainnet canonical ID while the
devnet registry remains scoped to the existing devnet deployment. This record
does not deploy, upgrade, publish an IDL, rotate keys, or change program
authority.

## Read-Only Evidence

| Item | Value |
| --- | --- |
| SATP source commit | `42cf9b39caa454fc39b5f2291c93a553a664562a` |
| Source path | `programs/escrow_v3` |
| Canonical mainnet escrow program ID | `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C` |
| Current devnet escrow program ID | `B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg` |
| Local build command | `cargo build-sbf --tools-version v1.52 --manifest-path programs/escrow_v3/Cargo.toml` |
| Local built artifact | `target/deploy/escrow_v3.so` |
| Local built artifact hash after canonical ID correction | `173ab0ddfdb4a68cf6bfae389f2f430eb97333501d49d6cad588525de2bfc55b` |
| Mainnet dump command | `solana program dump -u mainnet-beta HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C /tmp/escrow_v3-hxcuwkr2-mainnet.so` |
| Mainnet dumped artifact hash | `b70a7a7ea55f43da7bd3fc4f666e1374436bb9c8aeaa83cb2f0a2a970b603094` |
| Comparison result | `DIFFER` |
| Devnet dumped artifact hash for `B1Se8SP...` | `9426908b0c3084f316fc963a9824bd6aad55c2487da22ffe213bbfa3b772f82b` |
| Devnet ProgramData for `B1Se8SP...` | `7m4t1wqt26s5haqS1n2HsRNoewMvLnTbzPkfFGkpZDD5` |
| Devnet upgrade authority for `B1Se8SP...` | `Bq1niVKyTECn4HDxAJWiHZvRMCZndZtC113yj3Rkbroc` |
| Devnet last deployed slot for `B1Se8SP...` | `453440913` |
| Anchor devnet IDL fetch for `B1Se8SP...` | `AccountNotFound: pubkey=FivN5ANqf55Js5THDVzYU7tjq8mYkjdSE6xawpTAa3Ni` |
| Offline source checks | `npm run verify:v3-program-sources` passed |
| Offline IDL checks | `npm run validate:idls` passed |

## Diagnosis

The checked-in escrow source now declares the owner-selected canonical program
ID `HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C`. Rebuilding from that source
does not produce byte-identical output to the deployed mainnet ELF: the rebuilt
source hash is `173ab0dd...`, while the dumped mainnet hash is `b70a7a7e...`.

Because corrected source identity and deployed mainnet bytes differ, the current
state still does not prove `source == deployed == IDL` for AgentFolio escrow
consumption. AgentFolio should therefore keep live escrow writes gated until the
source/deployed/IDL proof is resolved or explicitly accepted through HQ.

## No-Write Repair Plan

1. Keep AgentFolio escrow rebuild status gated as "unverified canonical escrow".
   The current source and checked-in IDL may be used for local/offline SDK
   tests, but must not be represented as matching the deployed mainnet program.
2. Preserve the read-only evidence above in SATP docs and HQ task evidence so
   later repair work has the exact canonical mainnet program ID, devnet program
   ID, local build hash, mainnet dump hash, comparison result, and devnet
   disposition.
3. Choose one future write-approved track in HQ:
   - Mainnet acceptance track: explicitly accept through HQ that current SATP
     source, checked-in IDL, and the deployed mainnet bytes differ; keep live
     escrow writes gated or document the accepted risk and consumer boundary.
   - Mainnet source-recovery track: locate the exact source and IDL that
     produced the current mainnet hash `b70a7a7e...`, commit or archive that
     evidence, and rerun the same proof against the deployed program without
     writing to mainnet.
   - Replacement track: explicitly approve a future write task to deploy or
     upgrade `programs/escrow_v3` from the reviewed source, publish the matching
     Anchor IDL where applicable, then rerun the same dump/hash/IDL fetch proof.
4. Before any future write, require an HQ task naming the intended program ID,
   signer/authority owner, deploy command, IDL publish command, rollback path,
   and post-write proof commands. No implicit signer or keypair discovery should
   be used.
5. After an approved repair, accept the program only when all of these pass:
   source rebuild hash equals mainnet dump hash; Anchor IDL fetch succeeds; the
   fetched IDL hash equals the canonical checked-in IDL; `npm run
   verify:v3-program-sources` passes; `npm run validate:idls` passes.

## Stop Condition

This task stops at diagnosis and no-write repair planning. No deploy, upgrade,
IDL publish, keypair action, authority change, or AgentFolio architecture change
is authorized by this document.

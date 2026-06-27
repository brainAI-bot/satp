# Archived AgentFolio SATP V3 Consumer Integration Notes

Status: archived consumer context. This document is not SATP core protocol
authority and does not authorize AgentFolio product work, downstream deploys,
database migration, Solana devnet/mainnet writes, keypair reads or changes, npm
publish, production restart, public launch, or client commitments.

AgentFolio is one downstream consumer of SATP. SATP owns protocol semantics,
IDL/program references, PDA derivation helpers, unsigned transaction builders,
and app-agnostic verification helpers. AgentFolio-owned routes, database cache
behavior, profile UX, marketplace policy, and server deployment remain outside
the SATP repo unless HQ assigns a separate consumer integration task.

The notes below are retained only to explain historical AgentFolio integration
expectations during extraction. Treat every path and deadline as consumer-owned
context, not as a SATP execution plan.

## Historical Phase 1: Client Update

1. **Update AgentFolio SATP client** (`src/satp-client/src/constants.js` + `src/satp-identity-client.js`)
   - Replace V2 program IDs with V3 mainnet program IDs:
     - Identity: GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG
     - Reviews: r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4
     - Reputation: 2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ
     - Attestations: 6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD
     - Validation: 6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV
   - Update PDA derivation: `[b"genesis", sha256(agent_id)]` instead of `[b"identity", wallet]`
   - Update all account struct deserialization for GenesisRecord fields
   - Export new client functions: `createGenesisRecord()`, `burnToBecome()`, `getGenesisRecord()`

2. **Consumer-owned deploy of updated client to AgentFolio server**
   - Copy V3 client lib to `/home/ubuntu/agentfolio/src/satp-client/`
   - Test: `node -e "const c = require('./src/satp-client'); console.log(c.PROGRAM_IDS)"` shows V3 IDs

3. **Consumer-owned migration of existing agents**
   - Use `migrate_v2_to_v3` instruction for each existing V2 identity
   - Map: old wallet-seeded PDA -> new agent_id-seeded GenesisRecord
   - Test each migration on devnet first, then mainnet

## Historical Phase 2: Backend Wiring

1. **Registration flow**: When a profile is created in DB, also create V3 GenesisRecord on-chain
   - `src/routes/satp-auto-identity.js` — update to use V3 `create_identity` with `agent_id_hash`
   - Pass: name, description, category, capabilities, metadata_uri
   - Store the on-chain TX signature in the profile DB record

2. **Verification flow**: When wallet is verified, link it on-chain
   - After Solana wallet verification succeeds, call V3 `link_wallet` instruction
   - Store linked wallet TX in verification_data

3. **Burn-to-Become flow**: When BOA avatar is burned, call V3 `burn_to_become`
   - Pass: face_image (Arweave URL), face_mint (soulbound mint address), face_burn_tx (burn TX sig)
   - This sets the permanent face on the GenesisRecord

4. **Read path**: SATP API endpoints read from V3 on-chain data
   - `/api/satp/identity/:wallet` -> fetch GenesisRecord by agent_id_hash
   - `/api/satp/scores/:wallet` -> read reputation_score + verification_level from GenesisRecord
   - Profile page fetches these and displays on-chain data alongside DB data

5. **Dual-write**: Every DB write also writes on-chain (where applicable)
   - Profile update -> V3 `update_identity` (description, category, capabilities)
   - Verification -> V3 `update_verification` (level)
   - Review -> V3 Reviews program

## Historical Phase 3: Frontend Display

1. **Profile page**: Show on-chain data section
   - GenesisRecord fields: birth timestamp, face image, authority, linked wallets
   - On-chain reputation score + verification level
   - Link to Solscan for each on-chain account

2. **Verify page**: Show on-chain verification status
   - Display linked wallets from V3
   - Show authority address

3. **SATP page**: Full V3 Genesis Record explorer
   - View any agent's on-chain identity by agent_id
   - Show all V3 program data (reviews, attestations, reputation)

## Testing Checklist
- [ ] Register new agent -> GenesisRecord created on-chain
- [ ] Verify wallet -> Wallet linked on-chain
- [ ] Burn-to-become -> Face set permanently on-chain
- [ ] Profile page shows on-chain data correctly
- [ ] SATP API returns V3 data
- [ ] Migrate team agents from V2 -> V3
- [ ] Old V2 endpoints still work (backward compat) or gracefully redirect

## Key Files to Modify
- `src/satp-client/src/constants.js` — V3 program IDs
- `src/satp-client/src/index.js` — V3 client functions
- `src/satp-identity-client.js` — V3 identity reads
- `src/routes/satp-auto-identity.js` — V3 auto-create on registration
- `src/routes/satp-api.js` — V3 API endpoints
- `src/lib/burn-to-become.js` — V3 burn-to-become integration
- Frontend: profile page, verify page, SATP page

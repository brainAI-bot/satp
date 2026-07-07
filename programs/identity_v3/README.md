# identity_v3 — SATP Identity Registry

**Program ID:** `GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG`  
**Network:** Solana Mainnet  
**Framework:** Anchor v0.30+  
**Last Deploy:** 2026-03-31 (hardened build — admin backdoors removed)

---

## Overview

The SATP (Solana Agent Token Protocol) Identity Registry is the on-chain identity layer for AI agents. Each agent gets a **GenesisRecord** — a soulbound on-chain identity containing their name, description, face NFT data, reputation score, verification level, and authority keys.

Think of it as an on-chain passport for AI agents.

### Key Features
- **Soulbound identity** — one genesis record per agent (PDA-derived)
- **Burn-to-become** — agents permanently bind a face NFT (burn it, record the proof)
- **CPI-gated scores** — reputation and verification levels can only be updated by authorized program PDAs (not wallets)
- **Authority rotation** — two-step propose/accept pattern (like ownership transfer)
- **Name registry** — unique, case-insensitive agent names
- **Wallet linking** — multi-chain wallet attestations
- **Mint tracking** — rate-limits free mints per identity

---

## Program IDs

| Program | ID | Role |
|---------|-----|------|
| **identity_v3** | `GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG` | Identity registry (this program) |
| **reputation_v3** | `2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ` | Reputation scoring (CPI caller) |
| **validation_v3** | `6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV` | Verification levels (CPI caller) |

---

## Account Types

### GenesisRecord (1384 bytes)

The primary identity account. One per agent.

**PDA Seeds:** `["genesis", agent_id_hash]`  
- `agent_id_hash` = SHA-256 of the agent's string ID (e.g., `sha256("brainkid")`)

| Field | Type | Size | Description |
|-------|------|------|-------------|
| *discriminator* | `[u8; 8]` | 8 | Anchor account discriminator |
| `agent_id_hash` | `[u8; 32]` | 32 | SHA-256 of agent ID string |
| `agent_name` | `String` | 4+32 | Display name (max 32 chars) |
| `description` | `String` | 4+256 | Agent description (max 256 chars) |
| `category` | `String` | 4+32 | Category (max 32 chars) |
| `capabilities` | `Vec<String>` | 4+(4+32)×10 | Up to 10 capabilities (max 32 chars each) |
| `metadata_uri` | `String` | 4+200 | Metadata URI (max 200 chars) |
| `face_image` | `String` | 4+200 | Arweave URL of face image (permanent after birth) |
| `face_mint` | `Pubkey` | 32 | Soulbound BOA NFT mint address |
| `face_burn_tx` | `String` | 4+88 | Burn transaction signature |
| `genesis_record` | `i64` | 8 | Birth timestamp (0 = unborn) |
| `is_active` | `bool` | 1 | Active/deactivated status |
| `authority` | `Pubkey` | 32 | Current authority (can manage this record) |
| `pending_authority` | `Option<Pubkey>` | 1+32 | Pending authority (for rotation) |
| `reputation_score` | `u64` | 8 | Reputation score (0–1,000,000) |
| `verification_level` | `u8` | 1 | Verification level (0–5) |
| `reputation_updated_at` | `i64` | 8 | Last reputation update timestamp |
| `verification_updated_at` | `i64` | 8 | Last verification update timestamp |
| `created_at` | `i64` | 8 | Account creation timestamp |
| `updated_at` | `i64` | 8 | Last update timestamp |
| `bump` | `u8` | 1 | PDA bump seed |

**Total allocated:** 1384 bytes (including discriminator)

### LinkedWallet (138 bytes)

Multi-chain wallet attestation linked to an identity.

**PDA Seeds:** `["linked_wallet", genesis_key, wallet_pubkey]`

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `identity` | `Pubkey` | 32 | Genesis record PDA this wallet belongs to |
| `wallet` | `Pubkey` | 32 | Linked wallet address |
| `chain` | `String` | 4+16 | Chain identifier (max 16 chars, e.g., "solana", "ethereum") |
| `label` | `String` | 4+32 | Label (max 32 chars, e.g., "Treasury") |
| `verified_at` | `i64` | 8 | Verification timestamp |
| `is_active` | `bool` | 1 | Active status (false after unlink) |
| `bump` | `u8` | 1 | PDA bump seed |

### MintTracker (50 bytes)

Rate-limits free mints per identity (max 3).

**PDA Seeds:** `["mint_tracker", genesis_key]`

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `identity` | `Pubkey` | 32 | Genesis record PDA |
| `mint_count` | `u8` | 1 | Number of mints used (max 3) |
| `last_mint_timestamp` | `i64` | 8 | Last mint time |
| `bump` | `u8` | 1 | PDA bump seed |

### NameRegistry (150 bytes)

Unique, case-insensitive agent name reservation.

**PDA Seeds:** `["name_registry", name_hash]`  
- `name_hash` = SHA-256 of lowercase name

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `name` | `String` | 4+32 | Display name (preserves case) |
| `name_hash` | `[u8; 32]` | 32 | SHA-256 of lowercase name |
| `identity` | `Pubkey` | 32 | Genesis record PDA that owns this name |
| `authority` | `Pubkey` | 32 | Registrant authority |
| `registered_at` | `i64` | 8 | Registration timestamp |
| `is_active` | `bool` | 1 | Active status (false after release) |
| `bump` | `u8` | 1 | PDA bump seed |

---

## Instructions

### Identity Lifecycle

#### `create_identity`
Create a new agent identity.

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id_hash` | `[u8; 32]` | SHA-256 of agent ID string |
| `name` | `String` | Display name (2-32 chars) |
| `description` | `String` | Description (max 256 chars) |
| `category` | `String` | Category (max 32 chars) |
| `capabilities` | `Vec<String>` | Up to 10 capabilities (max 32 chars each) |
| `metadata_uri` | `String` | Metadata URI (max 200 chars) |

**Signer:** `creator` (becomes initial `authority`)  
**Creates:** GenesisRecord PDA  
**Emits:** `IdentityCreated`

#### `burn_to_become`
Permanently bind a face NFT to the identity (the "birth" event).

| Parameter | Type | Description |
|-----------|------|-------------|
| `face_image` | `String` | Arweave URL of face image |
| `face_mint` | `Pubkey` | BOA NFT mint address (burned) |
| `face_burn_tx` | `String` | Burn transaction signature |

**Signer:** `authority`  
**Guard:** Can only be called once (`genesis_record` must be 0)  
**Emits:** `AgentBorn`  
**Effect:** Sets `genesis_record` to current timestamp. Face data is permanent.

#### `update_identity`
Update mutable identity fields.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `Option<String>` | New name (immutable after birth!) |
| `description` | `Option<String>` | New description |
| `category` | `Option<String>` | New category |
| `capabilities` | `Option<Vec<String>>` | New capabilities |
| `metadata_uri` | `Option<String>` | New metadata URI |

**Signer:** `authority`  
**Guard:** Name cannot be changed after `genesis_record > 0` (agent is born)  
**Guard:** Identity must be active (`is_active == true`)  
**Emits:** `IdentityUpdated`

#### `deactivate_identity`
Soft-delete an identity. Scores cannot be updated while deactivated.

**Signer:** `authority`  
**Guard:** Must be active  
**Emits:** `IdentityDeactivated`

#### `reactivate_identity`
Restore a deactivated identity.

**Signer:** `authority`  
**Guard:** Must be deactivated  
**Emits:** `IdentityReactivated`

---

### Authority Management

Two-step authority rotation pattern (like OpenZeppelin Ownable2Step):

#### `propose_authority`
Propose a new authority. Does NOT transfer immediately.

| Parameter | Type | Description |
|-----------|------|-------------|
| `new_authority` | `Pubkey` | Proposed new authority |

**Signer:** current `authority`  
**Guard:** New authority must differ from current  
**Emits:** `AuthorityProposed`

#### `accept_authority`
Accept a pending authority proposal. Completes the transfer.

**Signer:** `new_authority` (the proposed authority must sign)  
**Emits:** `AuthorityTransferred`

#### `cancel_authority_transfer`
Cancel a pending authority proposal.

**Signer:** current `authority`

---

### Score Updates (CPI-Only)

These instructions can ONLY be called via CPI from authorized program PDAs. Regular wallets cannot call them.

#### `update_reputation`
Update the agent's reputation score.

| Parameter | Type | Description |
|-----------|------|-------------|
| `score` | `u64` | New reputation score (0–1,000,000) |

**CPI Caller:** PDA derived from `["reputation_v3_authority"]` under program `2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ`  
**Guard:** Score must be ≤ 1,000,000. Identity must be active.  
**Emits:** `ReputationUpdated`

#### `update_verification`
Update the agent's verification level.

| Parameter | Type | Description |
|-----------|------|-------------|
| `level` | `u8` | New verification level (0–5) |

**CPI Caller:** PDA derived from `["validation_v3_authority"]` under program `6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV`  
**Guard:** Level must be ≤ 5. Identity must be active.  
**Emits:** `VerificationUpdated`

**Verification Levels:**
| Level | Name | Meaning |
|-------|------|---------|
| 0 | Unverified | No verification |
| 1 | Basic | Self-declared identity |
| 2 | Verified | Human-verified identity |
| 3 | Established | Track record + verification |
| 4 | Trusted | High trust, multiple attestations |
| 5 | Sovereign | Maximum trust level |

---

### Wallet Linking

#### `link_wallet`
Link an external wallet to the identity.

| Parameter | Type | Description |
|-----------|------|-------------|
| `wallet` | `Pubkey` | Wallet address to link |
| `chain` | `String` | Chain identifier (max 16 chars) |
| `label` | `String` | Label (max 32 chars) |

**Signer:** `authority`  
**Creates:** LinkedWallet PDA  
**Emits:** `WalletLinked`

#### `unlink_wallet`
Deactivate a linked wallet (soft delete).

**Signer:** `authority`  
**Guard:** Wallet must be currently active  
**Emits:** `WalletUnlinked`

---

### Mint Tracking

#### `init_mint_tracker`
Initialize the mint tracker for an identity.

**Signer:** `authority`  
**Creates:** MintTracker PDA

#### `record_mint`
Record a new mint against the identity (max 3 free mints).

**Signer:** `authority`  
**Guard:** `mint_count < 3`  
**Emits:** `MintRecorded`

---

### Name Registry

#### `register_name`
Register a unique agent name.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `String` | Display name (2-32 chars) |
| `name_hash` | `[u8; 32]` | SHA-256 of lowercase name |

**Signer:** `authority`  
**Guard:** `name_hash` must match `sha256(name.to_lowercase())`  
**Creates:** NameRegistry PDA  
**Emits:** `NameRegistered`

#### `release_name`
Release a registered name.

**Signer:** `authority`  
**Guard:** Name must be owned by signer's identity  
**Emits:** `NameReleased`

---

### Admin Instructions (Upgrade Authority Only)

#### `admin_set_born`
Set the birth timestamp for an agent (admin override for non-standard birth flows).

**Signer:** Program upgrade authority (verified via BPFLoaderUpgradeable programdata)  
**Guard:** `genesis_record` must be 0 (not already born)  
**Emits:** `AgentBorn`

### Migration Instructions (Legacy)

#### `migrate_v2_to_v3`
Create a V3 genesis record from a V2 identity. The V2 authority must sign.

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id_hash` | `[u8; 32]` | SHA-256 of agent ID string |
| `name` | `String` | Display name |
| `description` | `String` | Description |
| `category` | `String` | Category |
| `capabilities` | `Vec<String>` | Capabilities |
| `metadata_uri` | `String` | Metadata URI |

**Signer:** V2 authority wallet  
**Creates:** New GenesisRecord PDA  
**Note:** V2 account is NOT closed (stays as historical reference)

---

## Removed Instructions (Security Hardening — 2026-03-31)

The following instructions were removed to reduce attack surface after the V2→V3 migration was complete:

| Instruction | Risk Level | Reason Removed |
|-------------|-----------|----------------|
| `admin_rewrite_account` | **CRITICAL** | Could overwrite ANY genesis field (authority, scores, name) with arbitrary data. Emergency migration tool — no longer needed. |
| `admin_migrate_genesis_layout` | MEDIUM | Raw byte manipulation to insert `is_active` field. All accounts migrated — unnecessary attack surface. |
| `migrate_genesis_layout` | LOW | Same as above but authority-gated (instead of upgrade-authority-gated). |

All three were gated behind upgrade authority or account authority. However, `admin_rewrite_account` was essentially "god mode" — it could rewrite any field including authority, which undermines the trustless identity model.

**Deploy TX (hardened build):** `2C53TvcursmdDarmzBNuftJQsbo7CWKP8VYaSqSJa1iNTX6pCzFhN5w6qNWoPPGdBj3syJiA6LHbX1Ss4gda3LFK`

---

## Authority Model

```
┌─────────────────────────┐
│   Upgrade Authority     │ ← Can call admin_set_born
│   (deploy keypair)      │    Cannot modify scores/data
└────────────┬────────────┘
             │
┌────────────▼────────────┐
│   Account Authority     │ ← Can update identity, link wallets,
│   (per-agent keypair)   │    register names, propose rotation
└────────────┬────────────┘
             │
┌────────────▼────────────┐
│   reputation_v3 PDA     │ ← Can call update_reputation (CPI only)
│   validation_v3 PDA     │ ← Can call update_verification (CPI only)
└─────────────────────────┘
```

**Key security properties:**
1. **No wallet can directly set scores** — only program PDAs via CPI
2. **Authority rotation is 2-step** — propose + accept (prevents accidental transfers)
3. **Name immutability** — name locked after birth (prevents identity theft)
4. **Deactivation gating** — deactivated identities cannot receive score updates
5. **Admin instructions are minimal** — only `admin_set_born` remains

---

## Events

| Event | Fields | When |
|-------|--------|------|
| `IdentityCreated` | agent_id_hash, authority, timestamp | New identity created |
| `AgentBorn` | agent_id_hash, face_mint, genesis_record | burn_to_become or admin_set_born |
| `IdentityUpdated` | agent_id_hash, timestamp | Identity fields updated |
| `IdentityDeactivated` | agent_id_hash, timestamp | Identity deactivated |
| `IdentityReactivated` | agent_id_hash, timestamp | Identity reactivated |
| `IdentityMigrated` | agent_id_hash, authority | V2→V3 migration |
| `AuthorityProposed` | agent_id_hash, old_authority, new_authority | Rotation proposed |
| `AuthorityTransferred` | agent_id_hash, old_authority, new_authority | Rotation completed |
| `ReputationUpdated` | agent_id_hash, score, timestamp | Score changed |
| `VerificationUpdated` | agent_id_hash, level, timestamp | Level changed |
| `WalletLinked` | identity, wallet, chain | Wallet linked |
| `WalletUnlinked` | identity, wallet | Wallet unlinked |
| `MintRecorded` | identity, count, timestamp | Mint recorded |
| `NameRegistered` | name_hash, identity, name | Name registered |
| `NameReleased` | name_hash, identity | Name released |

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | `InvalidAccountData` | Account data doesn't match expected layout |
| 6001 | `Unauthorized` | Signer doesn't match account authority |
| 6002 | `NameTooLong` | Name > 32 chars |
| 6003 | `DescriptionTooLong` | Description > 256 chars |
| 6004 | `CategoryTooLong` | Category > 32 chars |
| 6005 | `TooManyCapabilities` | More than 10 capabilities |
| 6006 | `CapabilityTooLong` | Capability > 32 chars |
| 6007 | `MetadataUriTooLong` | URI > 200 chars |
| 6008 | `AlreadyBorn` | burn_to_become already done |
| 6009 | `FaceImageRequired` | Face image URL is required |
| 6010 | `FaceImageTooLong` | Face image URL > 200 chars |
| 6011 | `FaceBurnTxTooLong` | Burn TX signature > 88 chars |
| 6012 | `NameImmutableAfterBirth` | Can't change name after birth |
| 6013 | `ScoreOutOfRange` | Score > 1,000,000 |
| 6014 | `LevelOutOfRange` | Level > 5 |
| 6015 | `MintLimitReached` | Already used 3 free mints |
| 6016 | `SameAuthority` | New authority == current authority |
| 6017 | `NotPendingAuthority` | Signer isn't the pending authority |
| 6018 | `NoPendingTransfer` | No pending authority transfer |
| 6019 | `ChainTooLong` | Chain identifier > 16 chars |
| 6020 | `LabelTooLong` | Label > 32 chars |
| 6021 | `WalletAlreadyUnlinked` | Wallet already deactivated |
| 6022 | `AlreadyDeactivated` | Identity already deactivated |
| 6023 | `AlreadyActive` | Identity already active |
| 6024 | `IdentityDeactivated` | Can't update deactivated identity |
| 6025 | `InvalidNameLength` | Name < 2 or > 32 chars |
| 6026 | `NameHashMismatch` | Hash doesn't match lowercase name |
| 6027 | `NameNotOwned` | Name not owned by this identity |
| 6028 | `NameAlreadyReleased` | Name already released |
| 6029 | `UnauthorizedCaller` | CPI caller isn't an authorized program PDA |

---

## Deployment History

| Date | Action | TX | Notes |
|------|--------|----|-------|
| 2026-03-30 | V3 program deployed | — | Initial mainnet deployment |
| 2026-03-31 | V2→V3 migration | multiple | All 8 agents migrated |
| 2026-03-31 | Score correction | — | Fixed inflated scores from genesis migration |
| 2026-03-31 | Security hardening | `2C53Tvc...3LFK` | Removed 3 admin backdoors |

---

## Current Agents (Mainnet)

| Agent | Rep Score | Level | Born | Authority |
|-------|----------|-------|------|-----------|
| brainKID | 550 | L5 | ✅ | `Bq1ni...broc` (deploy) |
| brainGrowth | 270 | L3 | ✅ | `Bq1ni...broc` (deploy) |
| brainTrade | 200 | L2 | ✅ | `Bq1ni...broc` (deploy) |
| brainForge | 150 | L2 | ✅ | `Bq1ni...broc` (deploy) |
| brainTEST | 135 | L3 | ✅ | `ADrid...` (brainForge) |
| brainChain | 100 | L2 | ✅ | `Bq1ni...broc` (deploy) |
| AREMES | 100 | L2 | ✅ | `Bq1ni...broc` (pending→owner) |
| Suppi | 100 | L2 | ✅ | `JAbcY...` (Suppi wallet) |

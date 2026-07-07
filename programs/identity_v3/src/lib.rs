use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

declare_id!("7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ");

/// Maximum agent_id length
const MAX_AGENT_ID_LEN: usize = 64;

/// Authorized CPI program IDs (compile-time constants for security)
/// Replaces runtime .parse().unwrap() — zero panic risk.
const REPUTATION_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0xb0, 0xb3, 0x8d, 0x6e, 0xa6, 0xc2, 0x56, 0x27,
    0xd5, 0x0d, 0x89, 0xf5, 0xc5, 0xcb, 0xe0, 0xd8,
    0x62, 0xe1, 0x0d, 0xce, 0x72, 0xda, 0xec, 0x72,
    0x2f, 0x02, 0x2f, 0xa9, 0x13, 0xc3, 0x6c, 0x60,
]); // CtmZ1fHaypt3R6wbeiGawiRnjzRK9T8jsECk9mET9AK9 (devnet)

const VALIDATION_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0xb7, 0x35, 0xb4, 0x49, 0xb8, 0x79, 0x27, 0x29,
    0xec, 0xa6, 0xb8, 0xaf, 0xe9, 0xb2, 0x70, 0xd8,
    0xff, 0xf9, 0xff, 0xfc, 0xc7, 0xfd, 0xcd, 0x95,
    0x76, 0xe5, 0x2b, 0x59, 0x81, 0x86, 0x94, 0x04,
]); // DLB76DzAFY8KNuvnP79BZW3cehGreEQTeGDvFCNd2Ekj (devnet)

const ATTESTATIONS_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0x3c, 0x9a, 0xdf, 0x48, 0x1a, 0xf8, 0xc8, 0x9d,
    0x50, 0x8a, 0x31, 0x18, 0xe8, 0xa7, 0x27, 0xbf,
    0xe6, 0x00, 0xff, 0x21, 0x1c, 0x41, 0xf7, 0x6b,
    0x3a, 0xaa, 0x1d, 0x2e, 0xce, 0x71, 0x80, 0x3c,
]); // 55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw (devnet)

#[program]
pub mod identity_v3 {
    use super::*;

    // ─────────────────────────────────────────────
    //  GENESIS RECORD LIFECYCLE
    // ─────────────────────────────────────────────

    /// Create a Genesis Record for an agent.
    /// PDA seed: `[b"genesis", agent_id_hash]`
    /// Called at registration — face fields start empty (agent is "unborn").
    pub fn create_identity(
        ctx: Context<CreateIdentity>,
        agent_id_hash: [u8; 32],
        name: String,
        description: String,
        category: String,
        capabilities: Vec<String>,
        metadata_uri: String,
    ) -> Result<()> {
        require!(name.len() <= 32, IdentityError::NameTooLong);
        require!(description.len() <= 256, IdentityError::DescriptionTooLong);
        require!(category.len() <= 32, IdentityError::CategoryTooLong);
        require!(capabilities.len() <= 10, IdentityError::TooManyCapabilities);
        for cap in &capabilities {
            require!(cap.len() <= 32, IdentityError::CapabilityTooLong);
        }
        require!(metadata_uri.len() <= 200, IdentityError::MetadataUriTooLong);

        let genesis = &mut ctx.accounts.genesis;
        genesis.agent_id_hash = agent_id_hash;
        genesis.agent_name = name;
        genesis.description = description;
        genesis.category = category;
        genesis.capabilities = capabilities;
        genesis.metadata_uri = metadata_uri;

        // Face fields — empty until burn-to-become
        genesis.face_image = String::new();
        genesis.face_mint = Pubkey::default();
        genesis.face_burn_tx = String::new();
        genesis.genesis_record = 0; // 0 = unborn

        // Authority
        genesis.authority = ctx.accounts.creator.key();
        genesis.pending_authority = None;

        // Scores (CPI-updated)
        // L1 = Registered (has identity) — set immediately on creation
        genesis.reputation_score = 0;
        genesis.verification_level = 1;
        genesis.reputation_updated_at = 0;
        genesis.verification_updated_at = 0;

        // Timestamps
        genesis.is_active = true;
        genesis.created_at = Clock::get()?.unix_timestamp;
        genesis.updated_at = genesis.created_at;
        genesis.bump = ctx.bumps.genesis;

        emit!(IdentityCreated {
            agent_id_hash,
            authority: genesis.authority,
            timestamp: genesis.created_at,
        });

        Ok(())
    }

    /// Burn-to-become: set the agent's permanent face.
    /// This is the agent's "birth event" — irreversible.
    /// After this, face_image and face_mint are immutable.
    pub fn burn_to_become(
        ctx: Context<BurnToBecome>,
        face_image: String,
        face_mint: Pubkey,
        face_burn_tx: String,
    ) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;

        // Cannot burn-to-become twice
        require!(genesis.genesis_record == 0, IdentityError::AlreadyBorn);
        require!(!face_image.is_empty(), IdentityError::FaceImageRequired);
        require!(face_image.len() <= 200, IdentityError::FaceImageTooLong);
        require!(face_burn_tx.len() <= 88, IdentityError::FaceBurnTxTooLong);

        let now = Clock::get()?.unix_timestamp;
        genesis.face_image = face_image;
        genesis.face_mint = face_mint;
        genesis.face_burn_tx = face_burn_tx;
        genesis.genesis_record = now; // Birth timestamp — permanent
        genesis.updated_at = now;

        emit!(AgentBorn {
            agent_id_hash: genesis.agent_id_hash,
            face_mint,
            genesis_record: now,
        });

        Ok(())
    }

    /// Update identity metadata (authority only).
    /// Face fields are immutable after burn-to-become.
    pub fn update_identity(
        ctx: Context<UpdateIdentity>,
        name: Option<String>,
        description: Option<String>,
        category: Option<String>,
        capabilities: Option<Vec<String>>,
        metadata_uri: Option<String>,
    ) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;

        // Name is immutable after birth
        if let Some(n) = name {
            require!(genesis.genesis_record == 0, IdentityError::NameImmutableAfterBirth);
            require!(n.len() <= 32, IdentityError::NameTooLong);
            genesis.agent_name = n;
        }
        if let Some(d) = description {
            require!(d.len() <= 256, IdentityError::DescriptionTooLong);
            genesis.description = d;
        }
        if let Some(c) = category {
            require!(c.len() <= 32, IdentityError::CategoryTooLong);
            genesis.category = c;
        }
        if let Some(caps) = capabilities {
            require!(caps.len() <= 10, IdentityError::TooManyCapabilities);
            for cap in &caps {
                require!(cap.len() <= 32, IdentityError::CapabilityTooLong);
            }
            genesis.capabilities = caps;
        }
        if let Some(uri) = metadata_uri {
            require!(uri.len() <= 200, IdentityError::MetadataUriTooLong);
            genesis.metadata_uri = uri;
        }

        genesis.updated_at = Clock::get()?.unix_timestamp;

        emit!(IdentityUpdated {
            agent_id_hash: genesis.agent_id_hash,
            timestamp: genesis.updated_at,
        });

        Ok(())
    }

    // ─────────────────────────────────────────────
    //  AUTHORITY ROTATION (2-step)
    // ─────────────────────────────────────────────

    pub fn propose_authority(
        ctx: Context<UpdateIdentity>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;
        require!(new_authority != genesis.authority, IdentityError::SameAuthority);
        genesis.pending_authority = Some(new_authority);
        genesis.updated_at = Clock::get()?.unix_timestamp;

        emit!(AuthorityProposed {
            agent_id_hash: genesis.agent_id_hash,
            current_authority: genesis.authority,
            proposed_authority: new_authority,
            timestamp: genesis.updated_at,
        });
        Ok(())
    }

    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;
        let new_auth = ctx.accounts.new_authority.key();
        require!(genesis.pending_authority == Some(new_auth), IdentityError::NotPendingAuthority);

        let old = genesis.authority;
        genesis.authority = new_auth;
        genesis.pending_authority = None;
        genesis.updated_at = Clock::get()?.unix_timestamp;

        emit!(AuthorityTransferred {
            agent_id_hash: genesis.agent_id_hash,
            old_authority: old,
            new_authority: new_auth,
            timestamp: genesis.updated_at,
        });
        Ok(())
    }

    pub fn cancel_authority_transfer(ctx: Context<UpdateIdentity>) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;
        require!(genesis.pending_authority.is_some(), IdentityError::NoPendingTransfer);
        genesis.pending_authority = None;
        genesis.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    // ─────────────────────────────────────────────
    //  LINKED WALLETS
    // ─────────────────────────────────────────────

    pub fn link_wallet(
        ctx: Context<LinkWallet>,
        wallet: Pubkey,
        chain: String,
        label: String,
    ) -> Result<()> {
        require!(chain.len() <= 16, IdentityError::ChainTooLong);
        require!(label.len() <= 32, IdentityError::LabelTooLong);

        let linked = &mut ctx.accounts.linked_wallet;
        linked.identity = ctx.accounts.genesis.key();
        linked.wallet = wallet;
        linked.chain = chain;
        linked.label = label;
        linked.verified_at = Clock::get()?.unix_timestamp;
        linked.is_active = true;
        linked.bump = ctx.bumps.linked_wallet;

        emit!(WalletLinked {
            agent_id_hash: ctx.accounts.genesis.agent_id_hash,
            wallet,
            timestamp: linked.verified_at,
        });
        Ok(())
    }

    pub fn unlink_wallet(ctx: Context<UnlinkWallet>) -> Result<()> {
        let linked = &mut ctx.accounts.linked_wallet;
        require!(linked.is_active, IdentityError::WalletAlreadyUnlinked);
        linked.is_active = false;

        emit!(WalletUnlinked {
            agent_id_hash: ctx.accounts.genesis.agent_id_hash,
            wallet: linked.wallet,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    // ─────────────────────────────────────────────
    //  CPI ENDPOINTS
    // ─────────────────────────────────────────────

    /// Update reputation score — CPI-only via authorized program PDA.
    /// The caller_authority must be a PDA derived from an authorized program.
    /// Direct wallet calls are rejected by verifying the caller is a PDA
    /// (not on the ed25519 curve).
    pub fn update_reputation(ctx: Context<UpdateReputationCpi>, score: u64) -> Result<()> {
        require!(score <= 1_000_000, IdentityError::ScoreOutOfRange);

        // Security: verify caller is the reputation program's PDA.
        // We re-derive the expected PDA and compare. Only the reputation
        // program can sign as this PDA via CPI.
        let (expected_pda, _bump) = Pubkey::find_program_address(
            &[b"reputation_v3_authority"],
            &REPUTATION_PROGRAM_ID,
        );
        require!(
            ctx.accounts.caller_authority.key() == expected_pda,
            IdentityError::UnauthorizedCaller
        );

        // Security: reject updates to deactivated identities
        require!(ctx.accounts.genesis.is_active, IdentityError::IdentityDeactivated);

        let genesis = &mut ctx.accounts.genesis;
        genesis.reputation_score = score;
        genesis.reputation_updated_at = Clock::get()?.unix_timestamp;
        genesis.updated_at = genesis.reputation_updated_at;

        emit!(ReputationUpdated {
            agent_id_hash: genesis.agent_id_hash,
            score,
            timestamp: genesis.reputation_updated_at,
        });
        Ok(())
    }

    /// Update verification level — CPI-only via authorized program PDA.
    pub fn update_verification(ctx: Context<UpdateVerificationCpi>, level: u8) -> Result<()> {
        require!(level <= 5, IdentityError::LevelOutOfRange);

        // Security: verify caller is the validation program's PDA
        let (expected_pda, _bump) = Pubkey::find_program_address(
            &[b"validation_v3_authority"],
            &VALIDATION_PROGRAM_ID,
        );
        require!(
            ctx.accounts.caller_authority.key() == expected_pda,
            IdentityError::UnauthorizedCaller
        );

        // Security: reject updates to deactivated identities
        require!(ctx.accounts.genesis.is_active, IdentityError::IdentityDeactivated);

        let genesis = &mut ctx.accounts.genesis;
        genesis.verification_level = level;
        genesis.verification_updated_at = Clock::get()?.unix_timestamp;
        genesis.updated_at = genesis.verification_updated_at;

        emit!(VerificationUpdated {
            agent_id_hash: genesis.agent_id_hash,
            level,
            timestamp: genesis.verification_updated_at,
        });
        Ok(())
    }

    /// Update both score and level — CPI-only via attestations program PDA.
    /// Called by attestations_v3::recompute_score after attestation changes.
    /// Attestation-weighted score (0..1_000_000) and threshold-based level (0..5).
    pub fn update_score_and_level(ctx: Context<UpdateScoreAndLevelCpi>, score: u64, level: u8) -> Result<()> {
        require!(score <= 1_000_000, IdentityError::ScoreOutOfRange);
        require!(level <= 5, IdentityError::LevelOutOfRange);

        // Security: verify caller is the attestations program's PDA
        let (expected_pda, _bump) = Pubkey::find_program_address(
            &[b"attestations_v3_authority"],
            &ATTESTATIONS_PROGRAM_ID,
        );
        require!(
            ctx.accounts.caller_authority.key() == expected_pda,
            IdentityError::UnauthorizedCaller
        );

        // Security: reject updates to deactivated identities
        require!(ctx.accounts.genesis.is_active, IdentityError::IdentityDeactivated);

        let genesis = &mut ctx.accounts.genesis;
        let now = Clock::get()?.unix_timestamp;

        genesis.reputation_score = score;
        genesis.verification_level = level;
        genesis.reputation_updated_at = now;
        genesis.verification_updated_at = now;
        genesis.updated_at = now;

        emit!(ScoreAndLevelUpdated {
            agent_id_hash: genesis.agent_id_hash,
            score,
            level,
            timestamp: now,
        });
        Ok(())
    }

    // ─────────────────────────────────────────────
    //  MINT TRACKER
    // ─────────────────────────────────────────────

    pub fn init_mint_tracker(ctx: Context<InitMintTracker>) -> Result<()> {
        let tracker = &mut ctx.accounts.mint_tracker;
        tracker.identity = ctx.accounts.genesis.key();
        tracker.mint_count = 0;
        tracker.last_mint_timestamp = 0;
        tracker.bump = ctx.bumps.mint_tracker;
        Ok(())
    }

    pub fn record_mint(ctx: Context<RecordMint>) -> Result<()> {
        let tracker = &mut ctx.accounts.mint_tracker;
        require!(tracker.mint_count < 3, IdentityError::MintLimitReached);
        tracker.mint_count += 1;
        tracker.last_mint_timestamp = Clock::get()?.unix_timestamp;

        emit!(MintRecorded {
            identity: tracker.identity,
            mint_count: tracker.mint_count,
            timestamp: tracker.last_mint_timestamp,
        });
        Ok(())
    }

    // ─────────────────────────────────────────────
    //  DEACTIVATE / REACTIVATE IDENTITY
    // ─────────────────────────────────────────────

    /// Deactivate an identity. Authority only.
    /// Deactivated identities cannot perform actions
    /// but remain on-chain for historical reference.
    pub fn deactivate_identity(ctx: Context<UpdateIdentity>) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;
        require!(genesis.is_active, IdentityError::AlreadyDeactivated);

        genesis.is_active = false;
        genesis.updated_at = Clock::get()?.unix_timestamp;

        emit!(IdentityDeactivated {
            agent_id_hash: genesis.agent_id_hash,
            authority: genesis.authority,
            timestamp: genesis.updated_at,
        });
        Ok(())
    }

    /// Reactivate a previously deactivated identity.
    pub fn reactivate_identity(ctx: Context<UpdateIdentity>) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;
        require!(!genesis.is_active, IdentityError::AlreadyActive);

        genesis.is_active = true;
        genesis.updated_at = Clock::get()?.unix_timestamp;

        emit!(IdentityReactivated {
            agent_id_hash: genesis.agent_id_hash,
            authority: genesis.authority,
            timestamp: genesis.updated_at,
        });
        Ok(())
    }

    // ─────────────────────────────────────────────
    //  UNIQUE NAME REGISTRY
    // ─────────────────────────────────────────────

    /// Register a unique name for an agent identity.
    /// PDA seed: `[b"name_registry", name_hash]` where name_hash = SHA-256(lowercase(name))
    /// Once claimed, no other identity can use the same name (case-insensitive).
    pub fn register_name(
        ctx: Context<RegisterName>,
        name: String,
        name_hash: [u8; 32],
    ) -> Result<()> {
        require!(name.len() >= 2 && name.len() <= 32, IdentityError::InvalidNameLength);

        // Verify the hash matches the lowercase name
        let computed_hash = hash(name.to_lowercase().as_bytes()).to_bytes();
        require!(computed_hash == name_hash, IdentityError::NameHashMismatch);

        let registry = &mut ctx.accounts.name_registry;
        registry.name = name.clone();
        registry.name_hash = name_hash;
        registry.identity = ctx.accounts.genesis.key();
        registry.authority = ctx.accounts.authority.key();
        registry.registered_at = Clock::get()?.unix_timestamp;
        registry.is_active = true;
        registry.bump = ctx.bumps.name_registry;

        // Update the genesis record name to match
        let genesis = &mut ctx.accounts.genesis;
        genesis.agent_name = name.clone();
        genesis.updated_at = registry.registered_at;

        emit!(NameRegistered {
            name,
            name_hash,
            identity: registry.identity,
            timestamp: registry.registered_at,
        });
        Ok(())
    }

    /// Release a registered name. Authority only.
    /// Frees the name for others to claim.
    pub fn release_name(ctx: Context<ReleaseName>) -> Result<()> {
        let registry = &mut ctx.accounts.name_registry;
        require!(registry.is_active, IdentityError::NameAlreadyReleased);

        registry.is_active = false;

        emit!(NameReleased {
            name: registry.name.clone(),
            name_hash: registry.name_hash,
            identity: registry.identity,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    // ─────────────────────────────────────────────
    //  V2 → V3 MIGRATION
    // ─────────────────────────────────────────────

    /// Migrate a V2 identity to a V3 Genesis Record.
    /// The V2 authority must sign to prove ownership.
    /// Creates a new V3 PDA seeded by agent_id_hash.
    /// V2 account is NOT closed (stays as historical reference).
    ///
    /// Caller must provide metadata fields since V2 → V3 field mapping
    /// requires agent_id (which V2 doesn't store as a string).
    // [REMOVED] migrate_genesis_layout — all accounts migrated, see audit doc

    pub fn migrate_v2_to_v3(
        ctx: Context<MigrateV2ToV3>,
        agent_id_hash: [u8; 32],
        name: String,
        description: String,
        category: String,
        capabilities: Vec<String>,
        metadata_uri: String,
    ) -> Result<()> {
        require!(name.len() <= 32, IdentityError::NameTooLong);
        require!(description.len() <= 256, IdentityError::DescriptionTooLong);
        require!(category.len() <= 32, IdentityError::CategoryTooLong);
        require!(capabilities.len() <= 10, IdentityError::TooManyCapabilities);
        for cap in &capabilities {
            require!(cap.len() <= 32, IdentityError::CapabilityTooLong);
        }
        require!(metadata_uri.len() <= 200, IdentityError::MetadataUriTooLong);

        let now = Clock::get()?.unix_timestamp;
        let v2_auth = ctx.accounts.v2_authority.key();

        let genesis = &mut ctx.accounts.genesis;
        genesis.agent_id_hash = agent_id_hash;
        genesis.agent_name = name;
        genesis.description = description;
        genesis.category = category;
        genesis.capabilities = capabilities;
        genesis.metadata_uri = metadata_uri;

        // Face fields empty — migration doesn't transfer face
        genesis.face_image = String::new();
        genesis.face_mint = Pubkey::default();
        genesis.face_burn_tx = String::new();
        genesis.genesis_record = 0; // Unborn — burn-to-become must be done separately

        genesis.is_active = true;
        genesis.authority = v2_auth;
        genesis.pending_authority = None;
        genesis.reputation_score = 0; // Start at 0 — will be computed from V3 reviews
        genesis.verification_level = 0;
        genesis.reputation_updated_at = 0;
        genesis.verification_updated_at = 0;
        genesis.created_at = now;
        genesis.updated_at = now;
        genesis.bump = ctx.bumps.genesis;

        emit!(IdentityMigrated {
            agent_id_hash,
            v2_authority: v2_auth,
            timestamp: now,
        });

        Ok(())
    }

    /// Admin-only: set genesis_record (birth timestamp) for an agent.
    /// Can only be called by the program's upgrade authority.
    /// Used for agents who already have face data but genesis_record == 0.
    /// Does NOT overwrite face fields — only sets genesis_record if currently 0.
    pub fn admin_set_born(ctx: Context<AdminSetBorn>) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;

        // Only set if not already born
        require!(genesis.genesis_record == 0, IdentityError::AlreadyBorn);

        let now = Clock::get()?.unix_timestamp;
        genesis.genesis_record = now;
        genesis.updated_at = now;

        emit!(AgentBorn {
            agent_id_hash: genesis.agent_id_hash,
            face_mint: genesis.face_mint,
            genesis_record: now,
        });

        Ok(())
    }

    /// Admin-only: set face data on a born agent whose face fields are empty.
    /// This fixes the V2→V3 migration gap where agents were born via admin_set_born
    /// without carrying over face data from V2 records.
    /// Guards:
    ///   - face_image must be currently empty (cannot overwrite existing face data)
    ///   - genesis_record must be > 0 (agent must be born)
    ///   - Only upgrade authority can call
    /// Does NOT modify: authority, scores, genesis_record, is_active.
    pub fn admin_set_face(
        ctx: Context<AdminSetFace>,
        face_image: String,
        face_mint: Pubkey,
        face_burn_tx: String,
    ) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;

        // Only fix records that are born but missing face data
        require!(genesis.genesis_record > 0, IdentityError::NotBorn);
        require!(genesis.face_image.is_empty(), IdentityError::FaceAlreadySet);
        require!(!face_image.is_empty(), IdentityError::FaceImageRequired);
        require!(face_image.len() <= 200, IdentityError::FaceImageTooLong);
        require!(face_burn_tx.len() <= 88, IdentityError::FaceBurnTxTooLong);

        genesis.face_image = face_image.clone();
        genesis.face_mint = face_mint;
        genesis.face_burn_tx = face_burn_tx;
        genesis.updated_at = Clock::get()?.unix_timestamp;

        emit!(FaceDataSet {
            agent_id_hash: genesis.agent_id_hash,
            face_image,
            face_mint,
            timestamp: genesis.updated_at,
        });

        Ok(())
    }

    /// Admin-only: reset an agent's birth status to unborn.
    /// Sets genesis_record = 0 and clears face fields.
    /// Used for agents who were incorrectly marked as born without going
    /// through burn-to-become (e.g., admin_set_born used prematurely).
    /// Guards:
    ///   - Only upgrade authority can call
    ///   - Face fields must be empty (no real burn-to-become happened)
    ///   - If face data exists, use a different fix — this prevents
    ///     accidentally unbirting agents who have real soulbound NFTs
    pub fn admin_unbirth(ctx: Context<AdminUnbirth>) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;

        // Safety: only unbirth agents that have no face data
        // (i.e., they were born via admin_set_born without going through burn-to-become)
        require!(genesis.face_image.is_empty(), IdentityError::CannotUnbirthWithFace);
        require!(
            genesis.face_mint == Pubkey::default(),
            IdentityError::CannotUnbirthWithFace
        );

        let old_genesis = genesis.genesis_record;
        genesis.genesis_record = 0;
        genesis.face_burn_tx = String::new();
        genesis.updated_at = Clock::get()?.unix_timestamp;

        emit!(AgentUnbirthed {
            agent_id_hash: genesis.agent_id_hash,
            old_genesis_record: old_genesis,
            timestamp: genesis.updated_at,
        });

        Ok(())
    }

    /// Admin-only: close a stale/deactivated genesis account and reclaim rent.
    /// Guards:
    ///   - Only upgrade authority can call
    ///   - Account must be owned by this program
    ///   - Account must NOT be the canonical active V3 record (size != 1384 OR is_active == false)
    ///   - For V3 accounts (1384 bytes): must have is_active == false
    ///   - For V2 accounts (1383 bytes or other): can be closed unconditionally (legacy)
    /// Lamports are sent to the rent_recipient.
    pub fn admin_close_stale(ctx: Context<AdminCloseStale>) -> Result<()> {
        let stale_account = &ctx.accounts.stale_account;
        let data = stale_account.try_borrow_data()?;
        let data_len = data.len();

        // Safety: V3 active accounts are exactly 1384 bytes
        if data_len == GenesisRecord::SPACE {
            // This is a properly-sized V3 account — only close if deactivated
            // is_active is at a known offset. Let's check it.
            // Layout: 8 (disc) + 32 (hash) + variable strings...
            // Instead of parsing variable fields, check via Anchor deserialization
            // We need to verify is_active == false
            let genesis = GenesisRecord::try_deserialize(&mut &data[..])?;
            require!(!genesis.is_active, IdentityError::CannotCloseActiveAccount);
        }
        // else: non-standard size (V2 legacy at 1383 bytes, smoke tests, etc.) — safe to close

        drop(data);

        // Transfer lamports and zero the account
        let stale_lamports = stale_account.lamports();
        **stale_account.try_borrow_mut_lamports()? = 0;
        **ctx.accounts.rent_recipient.try_borrow_mut_lamports()? += stale_lamports;

        // Zero data to mark as closed
        let mut data = stale_account.try_borrow_mut_data()?;
        for byte in data.iter_mut() {
            *byte = 0;
        }

        emit!(StaleAccountClosed {
            account: stale_account.key(),
            lamports_recovered: stale_lamports,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Admin-only: delete (close) any genesis record regardless of active status.
    /// Use case: cleaning up test/spam registrations on-chain.
    /// Unlike admin_close_stale, this does NOT require the account to be deactivated.
    /// Guards:
    ///   - Only upgrade authority can call (verified via programdata)
    ///   - Account must be owned by this program
    /// Emits: IdentityDeleted event
    pub fn admin_delete_identity(ctx: Context<AdminDeleteIdentity>) -> Result<()> {
        let target = &ctx.accounts.target_account;
        let data = target.try_borrow_data()?;

        // Parse agent_id_hash for the event (skip 8 byte discriminator)
        let mut agent_hash = [0u8; 32];
        if data.len() >= 40 {
            agent_hash.copy_from_slice(&data[8..40]);
        }
        let was_active = if data.len() == GenesisRecord::SPACE {
            // Try to read is_active flag
            match GenesisRecord::try_deserialize(&mut &data[..]) {
                Ok(g) => g.is_active,
                Err(_) => false,
            }
        } else {
            false
        };

        drop(data);

        // Transfer lamports and zero the account
        let target_lamports = target.lamports();
        **target.try_borrow_mut_lamports()? = 0;
        **ctx.accounts.rent_recipient.try_borrow_mut_lamports()? += target_lamports;

        // Zero data to mark as closed
        let mut data = target.try_borrow_mut_data()?;
        for byte in data.iter_mut() {
            *byte = 0;
        }

        emit!(IdentityDeleted {
            agent_id_hash: agent_hash,
            account: target.key(),
            was_active,
            lamports_recovered: target_lamports,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Admin-only: force-set authority on a genesis record.
    /// Use case: agent keypair is lost/inaccessible, cannot complete propose/accept flow.
    /// Guards:
    ///   - Only upgrade authority can call
    ///   - Agent must be active
    ///   - Clears any pending_authority
    pub fn admin_set_authority(
        ctx: Context<AdminSetAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let genesis = &mut ctx.accounts.genesis;
        require!(genesis.is_active, IdentityError::AccountDeactivated);

        let old_authority = genesis.authority;
        genesis.authority = new_authority;
        genesis.pending_authority = None;
        genesis.updated_at = Clock::get()?.unix_timestamp;

        emit!(AuthorityForceSet {
            agent_id_hash: genesis.agent_id_hash,
            old_authority,
            new_authority,
            timestamp: genesis.updated_at,
        });

        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════
    // REMOVED (security hardening — 2026-03-31):
    //   - admin_rewrite_account (emergency tool, too powerful for prod)
    //   - admin_migrate_genesis_layout (migration complete)
    // See docs/ADMIN-INSTRUCTION-AUDIT.md for rationale.
    // Previous code preserved in git history.
    // ═══════════════════════════════════════════════════════════════════

    /// Admin-only: directly set reputation score and verification level.
    /// Use case: correcting scores after recompute CPI set wrong values,
    /// or syncing on-chain state with authoritative DB values.
    /// Guards:
    ///   - Only upgrade authority can call (verified via programdata)
    ///   - Score must be 0..=1_000_000
    ///   - Level must be 0..=5
    ///   - Agent must be active
    /// Emits: ScoreSet event
    pub fn admin_set_score(
        ctx: Context<AdminSetScore>,
        score: u64,
        level: u8,
    ) -> Result<()> {
        require!(score <= 1_000_000, IdentityError::ScoreOutOfRange);
        require!(level <= 5, IdentityError::LevelOutOfRange);

        let genesis = &mut ctx.accounts.genesis;
        require!(genesis.is_active, IdentityError::AccountDeactivated);

        let old_score = genesis.reputation_score;
        let old_level = genesis.verification_level;
        let now = Clock::get()?.unix_timestamp;

        genesis.reputation_score = score;
        genesis.verification_level = level;
        genesis.reputation_updated_at = now;
        genesis.verification_updated_at = now;
        genesis.updated_at = now;

        emit!(ScoreSet {
            agent_id_hash: genesis.agent_id_hash,
            old_score,
            new_score: score,
            old_level,
            new_level: level,
            timestamp: now,
        });

        Ok(())
    }
}

// ═════════════════════════════════════════════════
//  HELPER
// ═════════════════════════════════════════════════

pub fn agent_id_hash(agent_id: &str) -> [u8; 32] {
    hash(agent_id.as_bytes()).to_bytes()
}

// ═════════════════════════════════════════════════
//  ACCOUNTS
// ═════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(agent_id_hash: [u8; 32])]
pub struct CreateIdentity<'info> {
    #[account(
        init,
        payer = creator,
        space = GenesisRecord::SPACE,
        seeds = [b"genesis", agent_id_hash.as_ref()],
        bump,
    )]
    pub genesis: Account<'info, GenesisRecord>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnToBecome<'info> {
    #[account(
        mut,
        has_one = authority,
    )]
    pub genesis: Account<'info, GenesisRecord>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateIdentity<'info> {
    #[account(
        mut,
        has_one = authority,
    )]
    pub genesis: Account<'info, GenesisRecord>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(
        mut,
        constraint = genesis.pending_authority == Some(new_authority.key()) @ IdentityError::NotPendingAuthority,
    )]
    pub genesis: Account<'info, GenesisRecord>,
    pub new_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct LinkWallet<'info> {
    #[account(has_one = authority)]
    pub genesis: Account<'info, GenesisRecord>,
    #[account(
        init,
        payer = authority,
        space = LinkedWallet::SPACE,
        seeds = [b"linked_wallet", genesis.key().as_ref(), wallet.as_ref()],
        bump,
    )]
    pub linked_wallet: Account<'info, LinkedWallet>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnlinkWallet<'info> {
    #[account(has_one = authority)]
    pub genesis: Account<'info, GenesisRecord>,
    #[account(
        mut,
        seeds = [b"linked_wallet", genesis.key().as_ref(), linked_wallet.wallet.as_ref()],
        bump = linked_wallet.bump,
        constraint = linked_wallet.identity == genesis.key(),
    )]
    pub linked_wallet: Account<'info, LinkedWallet>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateReputationCpi<'info> {
    #[account(mut)]
    pub genesis: Account<'info, GenesisRecord>,
    /// Caller must be a PDA signer — enforces CPI-only access.
    /// The reputation program signs with its PDA [b"reputation_v3_authority"].
    /// Direct wallet calls will fail because wallets can't sign as a PDA.
    pub caller_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateVerificationCpi<'info> {
    #[account(mut)]
    pub genesis: Account<'info, GenesisRecord>,
    /// Caller must be a PDA signer — enforces CPI-only access.
    /// The validation program signs with its PDA [b"validation_v3_authority"].
    pub caller_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateScoreAndLevelCpi<'info> {
    #[account(mut)]
    pub genesis: Account<'info, GenesisRecord>,
    /// Caller must be the attestations program's PDA [b"attestations_v3_authority"].
    pub caller_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitMintTracker<'info> {
    #[account(has_one = authority)]
    pub genesis: Account<'info, GenesisRecord>,
    #[account(
        init,
        payer = authority,
        space = MintTracker::SPACE,
        seeds = [b"mint_tracker", genesis.key().as_ref()],
        bump,
    )]
    pub mint_tracker: Account<'info, MintTracker>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordMint<'info> {
    #[account(has_one = authority)]
    pub genesis: Account<'info, GenesisRecord>,
    #[account(
        mut,
        seeds = [b"mint_tracker", genesis.key().as_ref()],
        bump = mint_tracker.bump,
        constraint = mint_tracker.identity == genesis.key(),
    )]
    pub mint_tracker: Account<'info, MintTracker>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(name: String, name_hash: [u8; 32])]
pub struct RegisterName<'info> {
    #[account(
        mut,
        has_one = authority,
        constraint = genesis.is_active @ IdentityError::IdentityDeactivated,
    )]
    pub genesis: Account<'info, GenesisRecord>,
    #[account(
        init,
        payer = authority,
        space = NameRegistry::SPACE,
        seeds = [b"name_registry", name_hash.as_ref()],
        bump,
    )]
    pub name_registry: Account<'info, NameRegistry>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseName<'info> {
    #[account(has_one = authority)]
    pub genesis: Account<'info, GenesisRecord>,
    #[account(
        mut,
        constraint = name_registry.identity == genesis.key() @ IdentityError::NameNotOwned,
        constraint = name_registry.is_active @ IdentityError::NameAlreadyReleased,
    )]
    pub name_registry: Account<'info, NameRegistry>,
    pub authority: Signer<'info>,
}

// [REMOVED] MigrateGenesisLayout — migration complete

/// Admin-only: set genesis_record for agents with face data but genesis_record == 0.
/// Verified by checking the program's upgrade authority via BPFLoaderUpgradeable programdata.
#[derive(Accounts)]
pub struct AdminSetBorn<'info> {
    #[account(mut)]
    pub genesis: Account<'info, GenesisRecord>,
    /// The upgrade authority of this program — must be signer
    pub upgrade_authority: Signer<'info>,
    /// The program's programdata account — used to verify upgrade authority
    /// CHECK: Verified via constraint
    #[account(
        constraint = {
            let data = program_data.try_borrow_data()?;
            // ProgramData layout: 4 (state) + 8 (slot) + 1 (has_authority) + 32 (authority)
            let has_auth = data[12] == 1;
            let auth_bytes = &data[13..45];
            has_auth && auth_bytes == upgrade_authority.key().as_ref()
        } @ IdentityError::Unauthorized
    )]
    pub program_data: UncheckedAccount<'info>,
}

// [REMOVED] AdminMigrateGenesis — no longer needed

/// Admin-only: reset birth status. Same upgrade-authority pattern.
#[derive(Accounts)]
pub struct AdminUnbirth<'info> {
    #[account(mut)]
    pub genesis: Account<'info, GenesisRecord>,
    pub upgrade_authority: Signer<'info>,
    /// CHECK: Verified via constraint
    #[account(
        constraint = {
            let data = program_data.try_borrow_data()?;
            let has_auth = data[12] == 1;
            let auth_bytes = &data[13..45];
            has_auth && auth_bytes == upgrade_authority.key().as_ref()
        } @ IdentityError::Unauthorized
    )]
    pub program_data: UncheckedAccount<'info>,
}

/// Admin-only: close stale/deactivated genesis accounts and reclaim rent.
/// The stale_account is UncheckedAccount because V2 records (1383 bytes) won't
/// deserialize as V3 GenesisRecord (1384 bytes).
#[derive(Accounts)]
pub struct AdminCloseStale<'info> {
    /// The stale account to close. Must be owned by this program.
    /// CHECK: Validated in instruction logic (owner check + size/is_active check)
    #[account(
        mut,
        constraint = stale_account.owner == &crate::ID @ IdentityError::InvalidAccountData
    )]
    pub stale_account: UncheckedAccount<'info>,
    /// Receives the reclaimed lamports (typically the upgrade authority)
    /// CHECK: Any account can receive lamports
    #[account(mut)]
    pub rent_recipient: UncheckedAccount<'info>,
    /// The upgrade authority of this program — must be signer
    pub upgrade_authority: Signer<'info>,
    /// The program's programdata account — used to verify upgrade authority
    /// CHECK: Verified via constraint
    #[account(
        constraint = {
            let data = program_data.try_borrow_data()?;
            let has_auth = data[12] == 1;
            let auth_bytes = &data[13..45];
            has_auth && auth_bytes == upgrade_authority.key().as_ref()
        } @ IdentityError::Unauthorized
    )]
    pub program_data: UncheckedAccount<'info>,
}

/// Admin-only: delete (close) any genesis record.
/// Does NOT require deactivation first — for cleaning test/spam accounts.
#[derive(Accounts)]
pub struct AdminDeleteIdentity<'info> {
    /// The account to delete. Must be owned by this program.
    /// CHECK: Validated via constraint (owner check)
    #[account(
        mut,
        constraint = target_account.owner == &crate::ID @ IdentityError::InvalidAccountData
    )]
    pub target_account: UncheckedAccount<'info>,
    /// Receives the reclaimed lamports
    /// CHECK: Any account can receive lamports
    #[account(mut)]
    pub rent_recipient: UncheckedAccount<'info>,
    /// The upgrade authority of this program — must be signer
    pub upgrade_authority: Signer<'info>,
    /// The program's programdata account — used to verify upgrade authority
    /// CHECK: Verified via constraint
    #[account(
        constraint = {
            let data = program_data.try_borrow_data()?;
            let has_auth = data[12] == 1;
            let auth_bytes = &data[13..45];
            has_auth && auth_bytes == upgrade_authority.key().as_ref()
        } @ IdentityError::Unauthorized
    )]
    pub program_data: UncheckedAccount<'info>,
}

/// Admin-only: force-set authority on a genesis record.
/// Used when agent keypair is lost and propose/accept flow can't complete.
#[derive(Accounts)]
pub struct AdminSetAuthority<'info> {
    #[account(mut)]
    pub genesis: Account<'info, GenesisRecord>,
    /// The upgrade authority of this program — must be signer
    pub upgrade_authority: Signer<'info>,
    /// CHECK: Verified via constraint
    #[account(
        constraint = {
            let data = program_data.try_borrow_data()?;
            let has_auth = data[12] == 1;
            let auth_bytes = &data[13..45];
            has_auth && auth_bytes == upgrade_authority.key().as_ref()
        } @ IdentityError::Unauthorized
    )]
    pub program_data: UncheckedAccount<'info>,
}

/// Admin-only: directly set reputation score and verification level.
/// For correcting on-chain scores to match authoritative DB values.
#[derive(Accounts)]
pub struct AdminSetScore<'info> {
    #[account(mut)]
    pub genesis: Account<'info, GenesisRecord>,
    /// The upgrade authority of this program — must be signer
    pub upgrade_authority: Signer<'info>,
    /// CHECK: Verified via constraint
    #[account(
        constraint = {
            let data = program_data.try_borrow_data()?;
            let has_auth = data[12] == 1;
            let auth_bytes = &data[13..45];
            has_auth && auth_bytes == upgrade_authority.key().as_ref()
        } @ IdentityError::Unauthorized
    )]
    pub program_data: UncheckedAccount<'info>,
}

/// Admin-only: set face data on born agents with empty face fields.
/// Same upgrade-authority verification pattern as AdminSetBorn.
/// Reallocates the account to full GenesisRecord::SPACE if needed (pays rent delta).
#[derive(Accounts)]
pub struct AdminSetFace<'info> {
    #[account(
        mut,
        realloc = GenesisRecord::SPACE,
        realloc::payer = upgrade_authority,
        realloc::zero = false,
    )]
    pub genesis: Account<'info, GenesisRecord>,
    /// The upgrade authority of this program — must be signer
    #[account(mut)]
    pub upgrade_authority: Signer<'info>,
    /// The program's programdata account — used to verify upgrade authority
    /// CHECK: Verified via constraint
    #[account(
        constraint = {
            let data = program_data.try_borrow_data()?;
            let has_auth = data[12] == 1;
            let auth_bytes = &data[13..45];
            has_auth && auth_bytes == upgrade_authority.key().as_ref()
        } @ IdentityError::Unauthorized
    )]
    pub program_data: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(agent_id_hash: [u8; 32])]
pub struct MigrateV2ToV3<'info> {
    #[account(
        init,
        payer = v2_authority,
        space = GenesisRecord::SPACE,
        seeds = [b"genesis", agent_id_hash.as_ref()],
        bump,
    )]
    pub genesis: Account<'info, GenesisRecord>,
    /// V2 authority wallet — must sign to prove V2 identity ownership.
    /// V2 identity account can be passed as remaining_accounts[0] for verification.
    #[account(mut)]
    pub v2_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ═════════════════════════════════════════════════
//  STATE — THE GENESIS RECORD
// ═════════════════════════════════════════════════

#[account]
pub struct GenesisRecord {
    pub agent_id_hash: [u8; 32],        // 32 — SHA-256 of agent_id string
    pub agent_name: String,              // 4 + 32 = 36
    pub description: String,             // 4 + 256 = 260
    pub category: String,                // 4 + 32 = 36
    pub capabilities: Vec<String>,       // 4 + (4 + 32) * 10 = 364
    pub metadata_uri: String,            // 4 + 200 = 204

    // THE FACE (permanent after burn-to-become)
    pub face_image: String,              // 4 + 200 = 204 (Arweave URL)
    pub face_mint: Pubkey,               // 32 (soulbound BOA mint)
    pub face_burn_tx: String,            // 4 + 88 = 92 (burn TX signature)
    pub genesis_record: i64,             // 8 (birth timestamp, 0 = unborn)

    // STATUS
    pub is_active: bool,                 // 1

    // AUTHORITY (rotatable)
    pub authority: Pubkey,               // 32
    pub pending_authority: Option<Pubkey>, // 1 + 32 = 33

    // SCORES (CPI-updated)
    pub reputation_score: u64,           // 8
    pub verification_level: u8,          // 1
    pub reputation_updated_at: i64,      // 8
    pub verification_updated_at: i64,    // 8

    // TIMESTAMPS
    pub created_at: i64,                 // 8
    pub updated_at: i64,                 // 8
    pub bump: u8,                        // 1
}

impl GenesisRecord {
    pub const SPACE: usize = 8           // discriminator
        + 32                              // agent_id_hash
        + (4 + 32)                        // agent_name
        + (4 + 256)                       // description
        + (4 + 32)                        // category
        + (4 + (4 + 32) * 10)            // capabilities
        + (4 + 200)                       // metadata_uri
        + (4 + 200)                       // face_image
        + 32                              // face_mint
        + (4 + 88)                        // face_burn_tx
        + 8                               // genesis_record
        + 1                               // is_active
        + 32                              // authority
        + 33                              // pending_authority
        + 8                               // reputation_score
        + 1                               // verification_level
        + 8                               // reputation_updated_at
        + 8                               // verification_updated_at
        + 8                               // created_at
        + 8                               // updated_at
        + 1;                              // bump
}

#[account]
pub struct LinkedWallet {
    pub identity: Pubkey,       // 32
    pub wallet: Pubkey,         // 32
    pub chain: String,          // 4 + 16 = 20
    pub label: String,          // 4 + 32 = 36
    pub verified_at: i64,       // 8
    pub is_active: bool,        // 1
    pub bump: u8,               // 1
}

impl LinkedWallet {
    pub const SPACE: usize = 8 + 32 + 32 + (4 + 16) + (4 + 32) + 8 + 1 + 1; // 138
}

#[account]
pub struct MintTracker {
    pub identity: Pubkey,          // 32
    pub mint_count: u8,            // 1
    pub last_mint_timestamp: i64,  // 8
    pub bump: u8,                  // 1
}

impl MintTracker {
    pub const SPACE: usize = 8 + 32 + 1 + 8 + 1;
}

#[account]
pub struct NameRegistry {
    pub name: String,              // 4 + 32 = 36 (display name)
    pub name_hash: [u8; 32],       // 32 (SHA-256 of lowercase name)
    pub identity: Pubkey,          // 32 (genesis record PDA)
    pub authority: Pubkey,         // 32 (who registered it)
    pub registered_at: i64,        // 8
    pub is_active: bool,           // 1
    pub bump: u8,                  // 1
}

impl NameRegistry {
    pub const SPACE: usize = 8     // discriminator
        + (4 + 32)                  // name
        + 32                        // name_hash
        + 32                        // identity
        + 32                        // authority
        + 8                         // registered_at
        + 1                         // is_active
        + 1;                        // bump
}

// ═════════════════════════════════════════════════
//  EVENTS
// ═════════════════════════════════════════════════

#[event]
pub struct IdentityCreated {
    pub agent_id_hash: [u8; 32],
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AgentBorn {
    pub agent_id_hash: [u8; 32],
    pub face_mint: Pubkey,
    pub genesis_record: i64,
}

#[event]
pub struct IdentityUpdated {
    pub agent_id_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct AuthorityProposed {
    pub agent_id_hash: [u8; 32],
    pub current_authority: Pubkey,
    pub proposed_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferred {
    pub agent_id_hash: [u8; 32],
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct WalletLinked {
    pub agent_id_hash: [u8; 32],
    pub wallet: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct WalletUnlinked {
    pub agent_id_hash: [u8; 32],
    pub wallet: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ReputationUpdated {
    pub agent_id_hash: [u8; 32],
    pub score: u64,
    pub timestamp: i64,
}

#[event]
pub struct VerificationUpdated {
    pub agent_id_hash: [u8; 32],
    pub level: u8,
    pub timestamp: i64,
}

#[event]
pub struct ScoreAndLevelUpdated {
    pub agent_id_hash: [u8; 32],
    pub score: u64,
    pub level: u8,
    pub timestamp: i64,
}

#[event]
pub struct MintRecorded {
    pub identity: Pubkey,
    pub mint_count: u8,
    pub timestamp: i64,
}

#[event]
pub struct IdentityMigrated {
    pub agent_id_hash: [u8; 32],
    pub v2_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct IdentityDeactivated {
    pub agent_id_hash: [u8; 32],
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct IdentityReactivated {
    pub agent_id_hash: [u8; 32],
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct NameRegistered {
    pub name: String,
    pub name_hash: [u8; 32],
    pub identity: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AgentUnbirthed {
    pub agent_id_hash: [u8; 32],
    pub old_genesis_record: i64,
    pub timestamp: i64,
}

#[event]
pub struct StaleAccountClosed {
    pub account: Pubkey,
    pub lamports_recovered: u64,
    pub timestamp: i64,
}

#[event]
pub struct IdentityDeleted {
    pub agent_id_hash: [u8; 32],
    pub account: Pubkey,
    pub was_active: bool,
    pub lamports_recovered: u64,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityForceSet {
    pub agent_id_hash: [u8; 32],
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ScoreSet {
    pub agent_id_hash: [u8; 32],
    pub old_score: u64,
    pub new_score: u64,
    pub old_level: u8,
    pub new_level: u8,
    pub timestamp: i64,
}

#[event]
pub struct FaceDataSet {
    pub agent_id_hash: [u8; 32],
    pub face_image: String,
    pub face_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct NameReleased {
    pub name: String,
    pub name_hash: [u8; 32],
    pub identity: Pubkey,
    pub timestamp: i64,
}

// ═════════════════════════════════════════════════
//  ERRORS
// ═════════════════════════════════════════════════

#[error_code]
pub enum IdentityError {
    #[msg("Invalid account data for migration")]
    InvalidAccountData,
    #[msg("Unauthorized: signer does not match account authority")]
    Unauthorized,
    #[msg("Name must be 32 characters or less")]
    NameTooLong,
    #[msg("Description must be 256 characters or less")]
    DescriptionTooLong,
    #[msg("Category must be 32 characters or less")]
    CategoryTooLong,
    #[msg("Maximum 10 capabilities allowed")]
    TooManyCapabilities,
    #[msg("Each capability must be 32 characters or less")]
    CapabilityTooLong,
    #[msg("Metadata URI must be 200 characters or less")]
    MetadataUriTooLong,
    #[msg("Agent has already been born (burn-to-become already done)")]
    AlreadyBorn,
    #[msg("Face image URL is required for burn-to-become")]
    FaceImageRequired,
    #[msg("Face image URL must be 200 characters or less")]
    FaceImageTooLong,
    #[msg("Face burn TX must be 88 characters or less")]
    FaceBurnTxTooLong,
    #[msg("Name is immutable after burn-to-become")]
    NameImmutableAfterBirth,
    #[msg("Reputation score must be between 0 and 1,000,000")]
    ScoreOutOfRange,
    #[msg("Verification level must be between 0 and 5")]
    LevelOutOfRange,
    #[msg("Maximum 3 free mints per identity")]
    MintLimitReached,
    #[msg("New authority must be different from current")]
    SameAuthority,
    #[msg("Signer is not the pending authority")]
    NotPendingAuthority,
    #[msg("No pending authority transfer")]
    NoPendingTransfer,
    #[msg("Chain identifier must be 16 characters or less")]
    ChainTooLong,
    #[msg("Label must be 32 characters or less")]
    LabelTooLong,
    #[msg("Wallet is already unlinked")]
    WalletAlreadyUnlinked,
    #[msg("Identity is already deactivated")]
    AlreadyDeactivated,
    #[msg("Identity is already active")]
    AlreadyActive,
    #[msg("Identity is deactivated — reactivate first")]
    IdentityDeactivated,
    #[msg("Name must be between 2 and 32 characters")]
    InvalidNameLength,
    #[msg("Name hash does not match lowercase name")]
    NameHashMismatch,
    #[msg("Name is not owned by this identity")]
    NameNotOwned,
    #[msg("Name has already been released")]
    NameAlreadyReleased,
    #[msg("Caller must be an authorized program PDA, not a regular wallet")]
    UnauthorizedCaller,
    #[msg("Agent has not been born yet (genesis_record == 0)")]
    NotBorn,
    #[msg("Face data is already set — cannot overwrite")]
    FaceAlreadySet,
    #[msg("Cannot close an active V3 account — deactivate first")]
    CannotCloseActiveAccount,
    #[msg("Cannot unbirth an agent that has face data — they went through burn-to-become")]
    CannotUnbirthWithFace,
    #[msg("Cannot set authority on deactivated account")]
    AccountDeactivated,
}

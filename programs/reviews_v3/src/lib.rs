#![allow(unexpected_cfgs)]

#[cfg(all(feature = "devnet", feature = "mainnet"))]
compile_error!("enable at most one source identity feature");

use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

#[cfg(feature = "devnet")]
declare_id!("3yVFrWCpBnQdWNqmiCG9EpoZq7WYeQ421Gx5sUh41Kwk");

#[cfg(not(feature = "devnet"))]
declare_id!("r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4");

/// Compute SHA-256 hash of agent_id for PDA seeds (matches identity_v3).
pub fn agent_id_hash(agent_id: &str) -> [u8; 32] {
    hash(agent_id.as_bytes()).to_bytes()
}

#[program]
pub mod reviews_v3 {
    use super::*;

    /// Create a review for an agent (identified by agent_id, not wallet).
    /// PDA: `[b"review_v3", SHA256(agent_id), reviewer]`
    pub fn create_review(
        ctx: Context<CreateReview>,
        agent_id: String,
        rating: u8,
        review_text: String,
        metadata: String,
    ) -> Result<()> {
        require!(rating >= 1 && rating <= 5, ReviewError::InvalidRating);
        require!(review_text.len() <= 512, ReviewError::ReviewTextTooLong);
        require!(metadata.len() <= 256, ReviewError::MetadataTooLong);

        // Self-review prevention (V3.1):
        // On-chain enforcement via identity PDA. If the identity account is provided
        // (not system_program placeholder), we verify:
        //   1. PDA derivation: seeds [b"genesis", SHA256(agent_id)] @ identity_program
        //   2. Account owned by identity_v3 program
        //   3. Authority field (offset 8 + 32 + variable strings... ) != reviewer
        //
        // The identity_program account tells us which program to validate against.
        // When identity_program == system_program, the check is skipped (backwards compat).
        let identity_info = &ctx.accounts.identity_account;
        let identity_prog = &ctx.accounts.identity_program;
        let skip_check = identity_prog.key() == anchor_lang::system_program::ID;

        if !skip_check {
            // Verify PDA derivation: [b"genesis", SHA256(agent_id)] @ identity_program
            let id_hash = agent_id_hash(&agent_id);
            let (expected_pda, _bump) = Pubkey::find_program_address(
                &[b"genesis", id_hash.as_ref()],
                identity_prog.key,
            );
            require!(
                identity_info.key() == expected_pda,
                ReviewError::InvalidIdentityPda
            );

            // Verify owned by identity program
            require!(
                *identity_info.owner == *identity_prog.key,
                ReviewError::InvalidIdentityOwner
            );

            // Read authority from GenesisRecord.
            // Layout: [8 disc][32 agent_id_hash][4+32 name][4+256 desc][4+32 category]
            //         [4 + N*(4+32) caps][4+200 uri][4+200 face_image][32 face_mint]
            //         [4+88 face_burn_tx][8 genesis_record][1 is_active][32 authority]...
            // Variable-length fields require walking.
            let data = identity_info.try_borrow_data()?;
            require!(data.len() > 100, ReviewError::InvalidIdentityAccount);

            let mut offset: usize = 8; // skip discriminator
            offset += 32; // agent_id_hash

            // Walk variable-length fields: name, description, category
            for _ in 0..3 {
                require!(offset + 4 <= data.len(), ReviewError::InvalidIdentityAccount);
                let len = u32::from_le_bytes(
                    data[offset..offset+4].try_into()
                        .map_err(|_| error!(ReviewError::InvalidIdentityAccount))?
                ) as usize;
                offset += 4 + len;
            }

            // capabilities: Vec<String>
            require!(offset + 4 <= data.len(), ReviewError::InvalidIdentityAccount);
            let vec_len = u32::from_le_bytes(
                data[offset..offset+4].try_into()
                    .map_err(|_| error!(ReviewError::InvalidIdentityAccount))?
            ) as usize;
            offset += 4;
            for _ in 0..vec_len {
                require!(offset + 4 <= data.len(), ReviewError::InvalidIdentityAccount);
                let s_len = u32::from_le_bytes(
                    data[offset..offset+4].try_into()
                        .map_err(|_| error!(ReviewError::InvalidIdentityAccount))?
                ) as usize;
                offset += 4 + s_len;
            }

            // metadata_uri: String
            require!(offset + 4 <= data.len(), ReviewError::InvalidIdentityAccount);
            let uri_len = u32::from_le_bytes(
                data[offset..offset+4].try_into()
                    .map_err(|_| error!(ReviewError::InvalidIdentityAccount))?
            ) as usize;
            offset += 4 + uri_len;

            // face_image: String
            require!(offset + 4 <= data.len(), ReviewError::InvalidIdentityAccount);
            let face_len = u32::from_le_bytes(
                data[offset..offset+4].try_into()
                    .map_err(|_| error!(ReviewError::InvalidIdentityAccount))?
            ) as usize;
            offset += 4 + face_len;

            // face_mint: Pubkey (32)
            offset += 32;

            // face_burn_tx: String
            require!(offset + 4 <= data.len(), ReviewError::InvalidIdentityAccount);
            let burn_len = u32::from_le_bytes(
                data[offset..offset+4].try_into()
                    .map_err(|_| error!(ReviewError::InvalidIdentityAccount))?
            ) as usize;
            offset += 4 + burn_len;

            // genesis_record: i64 (8)
            offset += 8;

            // is_active: bool (1) — TD-008: verify identity is active
            require!(offset + 1 <= data.len(), ReviewError::InvalidIdentityAccount);
            let is_active = data[offset] != 0;
            offset += 1;

            // TD-008: Reject reviews for deactivated agents
            // A deactivated identity has zeroed authority, which could bypass the self-review check
            require!(
                is_active,
                ReviewError::AgentIdentityDeactivated
            );

            // authority: Pubkey (32) — THIS IS WHAT WE CHECK
            require!(offset + 32 <= data.len(), ReviewError::InvalidIdentityAccount);
            let authority = Pubkey::try_from(&data[offset..offset+32])
                .map_err(|_| error!(ReviewError::InvalidIdentityAccount))?;

            // Self-review check: reviewer must NOT be the agent's authority
            require!(
                authority != ctx.accounts.reviewer.key(),
                ReviewError::SelfReview
            );

            msg!("Self-review check passed: reviewer {} != authority {}", ctx.accounts.reviewer.key(), authority);
        }

        let now = Clock::get()?.unix_timestamp;
        let review = &mut ctx.accounts.review;
        review.agent_id = agent_id;
        review.agent_id_hash = agent_id_hash(&review.agent_id);
        review.reviewer = ctx.accounts.reviewer.key();
        review.rating = rating;
        review.review_text = review_text;
        review.metadata = metadata;
        review.created_at = now;
        review.updated_at = now;
        review.is_active = true;
        review.bump = ctx.bumps.review;

        // Increment review counter
        let counter = &mut ctx.accounts.review_counter;
        counter.count += 1;

        emit!(ReviewCreated {
            agent_id: review.agent_id.clone(),
            reviewer: review.reviewer,
            rating,
            timestamp: now,
        });

        Ok(())
    }

    /// Update an existing review (reviewer only).
    pub fn update_review(
        ctx: Context<UpdateReview>,
        rating: Option<u8>,
        review_text: Option<String>,
        metadata: Option<String>,
    ) -> Result<()> {
        let review = &mut ctx.accounts.review;

        if let Some(r) = rating {
            require!(r >= 1 && r <= 5, ReviewError::InvalidRating);
            review.rating = r;
        }
        if let Some(text) = review_text {
            require!(text.len() <= 512, ReviewError::ReviewTextTooLong);
            review.review_text = text;
        }
        if let Some(meta) = metadata {
            require!(meta.len() <= 256, ReviewError::MetadataTooLong);
            review.metadata = meta;
        }

        review.updated_at = Clock::get()?.unix_timestamp;

        emit!(ReviewUpdated {
            agent_id: review.agent_id.clone(),
            reviewer: review.reviewer,
            timestamp: review.updated_at,
        });

        Ok(())
    }

    /// Soft-delete a review (reviewer only).
    pub fn delete_review(ctx: Context<UpdateReview>) -> Result<()> {
        let review = &mut ctx.accounts.review;
        review.is_active = false;
        review.updated_at = Clock::get()?.unix_timestamp;

        emit!(ReviewDeleted {
            agent_id: review.agent_id.clone(),
            reviewer: review.reviewer,
            timestamp: review.updated_at,
        });

        Ok(())
    }

    /// Initialize a review counter for an agent (by agent_id).
    /// PDA: `[b"review_counter_v3", SHA256(agent_id)]`
    pub fn init_review_counter(
        ctx: Context<InitReviewCounter>,
        agent_id: String,
    ) -> Result<()> {
        let counter = &mut ctx.accounts.review_counter;
        counter.agent_id = agent_id;
        counter.agent_id_hash = agent_id_hash(&counter.agent_id);
        counter.count = 0;
        counter.bump = ctx.bumps.review_counter;
        Ok(())
    }
}

// ═════════════════════════════════════════════════
//  ACCOUNT STRUCTS
// ═════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(agent_id: String, rating: u8, review_text: String, metadata: String)]
pub struct CreateReview<'info> {
    #[account(
        init,
        payer = reviewer,
        space = Review::SPACE,
        seeds = [
            b"review_v3" as &[u8],
            &agent_id_hash(&agent_id) as &[u8],
            reviewer.key().as_ref(),
        ],
        bump,
    )]
    pub review: Account<'info, Review>,
    #[account(
        mut,
        seeds = [b"review_counter_v3" as &[u8], &agent_id_hash(&agent_id) as &[u8]],
        bump = review_counter.bump,
    )]
    pub review_counter: Account<'info, ReviewCounter>,
    #[account(mut)]
    pub reviewer: Signer<'info>,
    /// CHECK: Identity program for self-review checks. Pass system_program to skip.
    /// When provided (non-system_program), the instruction validates that the reviewer
    /// is not the agent's authority via on-chain identity PDA deserialization.
    pub identity_program: UncheckedAccount<'info>,
    /// CHECK: Identity PDA [b"genesis", SHA256(agent_id)] @ identity_program.
    /// Pass any account when identity_program == system_program (check skipped).
    /// Validated in instruction body when identity_program is provided.
    pub identity_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateReview<'info> {
    #[account(
        mut,
        has_one = reviewer,
    )]
    pub review: Account<'info, Review>,
    pub reviewer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(agent_id: String)]
pub struct InitReviewCounter<'info> {
    #[account(
        init,
        payer = payer,
        space = ReviewCounter::SPACE,
        seeds = [b"review_counter_v3" as &[u8], &agent_id_hash(&agent_id) as &[u8]],
        bump,
    )]
    pub review_counter: Account<'info, ReviewCounter>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ═════════════════════════════════════════════════
//  STATE
// ═════════════════════════════════════════════════

#[account]
pub struct Review {
    pub agent_id: String,       // 4 + 64 = 68
    pub agent_id_hash: [u8; 32], // 32 (for efficient filtering)
    pub reviewer: Pubkey,       // 32
    pub rating: u8,             // 1 (1-5)
    pub review_text: String,    // 4 + 512 = 516
    pub metadata: String,       // 4 + 256 = 260
    pub created_at: i64,        // 8
    pub updated_at: i64,        // 8
    pub is_active: bool,        // 1
    pub bump: u8,               // 1
}

impl Review {
    pub const SPACE: usize = 8 // discriminator
        + (4 + 64)  // agent_id
        + 32         // agent_id_hash
        + 32         // reviewer
        + 1          // rating
        + (4 + 512)  // review_text
        + (4 + 256)  // metadata
        + 8          // created_at
        + 8          // updated_at
        + 1          // is_active
        + 1;         // bump
}

#[account]
pub struct ReviewCounter {
    pub agent_id: String,        // 4 + 64 = 68
    pub agent_id_hash: [u8; 32], // 32
    pub count: u64,              // 8
    pub bump: u8,                // 1
}

impl ReviewCounter {
    pub const SPACE: usize = 8 + (4 + 64) + 32 + 8 + 1;
}

// ═════════════════════════════════════════════════
//  EVENTS
// ═════════════════════════════════════════════════

#[event]
pub struct ReviewCreated {
    pub agent_id: String,
    pub reviewer: Pubkey,
    pub rating: u8,
    pub timestamp: i64,
}

#[event]
pub struct ReviewUpdated {
    pub agent_id: String,
    pub reviewer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ReviewDeleted {
    pub agent_id: String,
    pub reviewer: Pubkey,
    pub timestamp: i64,
}

// ═════════════════════════════════════════════════
//  ERRORS
// ═════════════════════════════════════════════════

#[error_code]
pub enum ReviewError {
    #[msg("Rating must be between 1 and 5")]
    InvalidRating,
    #[msg("Review text must be 512 characters or less")]
    ReviewTextTooLong,
    #[msg("Metadata must be 256 characters or less")]
    MetadataTooLong,
    #[msg("Cannot review yourself — reviewer is the agent's authority")]
    SelfReview,
    #[msg("Invalid identity PDA — must derive from agent_id")]
    InvalidIdentityPda,
    #[msg("Identity account not owned by identity program")]
    InvalidIdentityOwner,
    #[msg("Invalid identity account data — cannot parse GenesisRecord")]
    InvalidIdentityAccount,
    #[msg("Agent identity is deactivated — cannot review a deactivated agent")]
    AgentIdentityDeactivated,
}

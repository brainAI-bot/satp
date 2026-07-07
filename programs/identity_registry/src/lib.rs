use anchor_lang::prelude::*;

declare_id!("EJtQh4Gyg88zXvSmFpxYkkeZsPwTsjfm4LvjmPQX1FD3");

#[program]
pub mod identity_registry {
    use super::*;

    pub fn create_identity(
        ctx: Context<CreateIdentity>,
        name: String,
        description: String,
        category: String,
        capabilities: Vec<String>,
        metadata_uri: String,
    ) -> Result<()> {
        validate_identity_fields(&name, &description, &category, &capabilities, &metadata_uri)?;

        let now = Clock::get()?.unix_timestamp;
        let identity = &mut ctx.accounts.identity;
        identity.agent_id = identity.key();
        identity.name = name.clone();
        identity.description = description;
        identity.category = category;
        identity.capabilities = capabilities;
        identity.metadata_uri = metadata_uri;
        identity.reputation_score = 0;
        identity.verification_level = 0;
        identity.reputation_updated_at = 0;
        identity.verification_updated_at = 0;
        identity.authority = ctx.accounts.authority.key();
        identity.created_at = now;
        identity.updated_at = now;
        identity.bump = ctx.bumps.identity;

        emit!(IdentityCreated {
            agent_id: identity.agent_id,
            name,
            timestamp: now,
        });

        Ok(())
    }

    pub fn init_mint_tracker(ctx: Context<InitMintTracker>) -> Result<()> {
        let tracker = &mut ctx.accounts.mint_tracker;
        tracker.agent_identity = ctx.accounts.identity.key();
        tracker.mint_count = 0;
        tracker.last_mint_timestamp = 0;
        tracker.bump = ctx.bumps.mint_tracker;
        Ok(())
    }

    pub fn record_mint(ctx: Context<RecordMint>) -> Result<()> {
        let tracker = &mut ctx.accounts.mint_tracker;
        require!(tracker.mint_count < u8::MAX, IdentityError::MintLimitReached);

        let now = Clock::get()?.unix_timestamp;
        tracker.mint_count = tracker
            .mint_count
            .checked_add(1)
            .ok_or(IdentityError::MintLimitReached)?;
        tracker.last_mint_timestamp = now;

        emit!(MintRecorded {
            agent_identity: ctx.accounts.identity.key(),
            mint_count: tracker.mint_count,
            timestamp: now,
        });

        Ok(())
    }

    pub fn update_identity(
        ctx: Context<UpdateIdentity>,
        name: Option<String>,
        description: Option<String>,
        category: Option<String>,
        capabilities: Option<Vec<String>>,
        metadata_uri: Option<String>,
    ) -> Result<()> {
        let identity = &mut ctx.accounts.identity;

        if let Some(value) = name {
            validate_string(&value, MAX_NAME_LEN, IdentityError::NameTooLong)?;
            identity.name = value;
        }
        if let Some(value) = description {
            validate_string(&value, MAX_DESCRIPTION_LEN, IdentityError::DescriptionTooLong)?;
            identity.description = value;
        }
        if let Some(value) = category {
            validate_string(&value, MAX_CATEGORY_LEN, IdentityError::CategoryTooLong)?;
            identity.category = value;
        }
        if let Some(value) = capabilities {
            validate_capabilities(&value)?;
            identity.capabilities = value;
        }
        if let Some(value) = metadata_uri {
            validate_string(&value, MAX_METADATA_URI_LEN, IdentityError::MetadataUriTooLong)?;
            identity.metadata_uri = value;
        }

        let now = Clock::get()?.unix_timestamp;
        identity.updated_at = now;

        emit!(IdentityUpdated {
            agent_id: identity.agent_id,
            timestamp: now,
        });

        Ok(())
    }

    pub fn update_reputation(ctx: Context<UpdateReputation>, score: u64) -> Result<()> {
        require!(score <= MAX_SCORE, IdentityError::ScoreOutOfRange);

        let identity = &mut ctx.accounts.identity;
        let now = Clock::get()?.unix_timestamp;
        identity.reputation_score = score;
        identity.reputation_updated_at = now;
        identity.updated_at = now;

        emit!(ReputationUpdated {
            agent_id: identity.agent_id,
            score,
            timestamp: now,
        });

        Ok(())
    }

    pub fn update_verification(ctx: Context<UpdateVerification>, level: u8) -> Result<()> {
        require!(level <= MAX_VERIFICATION_LEVEL, IdentityError::LevelOutOfRange);

        let identity = &mut ctx.accounts.identity;
        let now = Clock::get()?.unix_timestamp;
        identity.verification_level = level;
        identity.verification_updated_at = now;
        identity.updated_at = now;

        emit!(VerificationUpdated {
            agent_id: identity.agent_id,
            level,
            timestamp: now,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateIdentity<'info> {
    #[account(
        init,
        payer = authority,
        space = AgentIdentity::SPACE,
        seeds = [b"identity", authority.key().as_ref()],
        bump
    )]
    pub identity: Account<'info, AgentIdentity>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitMintTracker<'info> {
    #[account(seeds = [b"identity", authority.key().as_ref()], bump = identity.bump)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        init,
        payer = authority,
        space = MintTracker::SPACE,
        seeds = [b"mint_tracker", identity.key().as_ref()],
        bump
    )]
    pub mint_tracker: Account<'info, MintTracker>,
    #[account(mut, address = identity.authority @ IdentityError::ScoreOutOfRange)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordMint<'info> {
    #[account(seeds = [b"identity", authority.key().as_ref()], bump = identity.bump)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(
        mut,
        seeds = [b"mint_tracker", identity.key().as_ref()],
        bump = mint_tracker.bump,
        constraint = mint_tracker.agent_identity == identity.key() @ IdentityError::MintLimitReached
    )]
    pub mint_tracker: Account<'info, MintTracker>,
    #[account(address = identity.authority @ IdentityError::ScoreOutOfRange)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateIdentity<'info> {
    #[account(
        mut,
        seeds = [b"identity", authority.key().as_ref()],
        bump = identity.bump,
        has_one = authority @ IdentityError::ScoreOutOfRange
    )]
    pub identity: Account<'info, AgentIdentity>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
    pub caller_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateVerification<'info> {
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
    pub caller_authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct AgentIdentity {
    pub agent_id: Pubkey,
    #[max_len(64)]
    pub name: String,
    #[max_len(512)]
    pub description: String,
    #[max_len(64)]
    pub category: String,
    #[max_len(16, 64)]
    pub capabilities: Vec<String>,
    #[max_len(256)]
    pub metadata_uri: String,
    pub reputation_score: u64,
    pub verification_level: u8,
    pub reputation_updated_at: i64,
    pub verification_updated_at: i64,
    pub authority: Pubkey,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl AgentIdentity {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct MintTracker {
    pub agent_identity: Pubkey,
    pub mint_count: u8,
    pub last_mint_timestamp: i64,
    pub bump: u8,
}

impl MintTracker {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[event]
pub struct IdentityCreated {
    pub agent_id: Pubkey,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct IdentityUpdated {
    pub agent_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ReputationUpdated {
    pub agent_id: Pubkey,
    pub score: u64,
    pub timestamp: i64,
}

#[event]
pub struct VerificationUpdated {
    pub agent_id: Pubkey,
    pub level: u8,
    pub timestamp: i64,
}

#[event]
pub struct MintRecorded {
    pub agent_identity: Pubkey,
    pub mint_count: u8,
    pub timestamp: i64,
}

#[error_code]
pub enum IdentityError {
    #[msg("Name exceeds max length")]
    NameTooLong,
    #[msg("Description exceeds max length")]
    DescriptionTooLong,
    #[msg("Category exceeds max length")]
    CategoryTooLong,
    #[msg("Capability exceeds max length")]
    CapabilityTooLong,
    #[msg("Too many capabilities")]
    TooManyCapabilities,
    #[msg("Metadata URI exceeds max length")]
    MetadataUriTooLong,
    #[msg("Mint limit reached")]
    MintLimitReached,
    #[msg("Score out of range")]
    ScoreOutOfRange,
    #[msg("Verification level out of range")]
    LevelOutOfRange,
}

const MAX_NAME_LEN: usize = 64;
const MAX_DESCRIPTION_LEN: usize = 512;
const MAX_CATEGORY_LEN: usize = 64;
const MAX_CAPABILITIES: usize = 16;
const MAX_CAPABILITY_LEN: usize = 64;
const MAX_METADATA_URI_LEN: usize = 256;
const MAX_SCORE: u64 = 1_000_000;
const MAX_VERIFICATION_LEVEL: u8 = 5;

fn validate_identity_fields(
    name: &str,
    description: &str,
    category: &str,
    capabilities: &[String],
    metadata_uri: &str,
) -> Result<()> {
    validate_string(name, MAX_NAME_LEN, IdentityError::NameTooLong)?;
    validate_string(description, MAX_DESCRIPTION_LEN, IdentityError::DescriptionTooLong)?;
    validate_string(category, MAX_CATEGORY_LEN, IdentityError::CategoryTooLong)?;
    validate_capabilities(capabilities)?;
    validate_string(metadata_uri, MAX_METADATA_URI_LEN, IdentityError::MetadataUriTooLong)?;
    Ok(())
}

fn validate_capabilities(capabilities: &[String]) -> Result<()> {
    require!(
        capabilities.len() <= MAX_CAPABILITIES,
        IdentityError::TooManyCapabilities
    );
    for capability in capabilities {
        validate_string(capability, MAX_CAPABILITY_LEN, IdentityError::CapabilityTooLong)?;
    }
    Ok(())
}

fn validate_string(value: &str, max_len: usize, error: IdentityError) -> Result<()> {
    if value.len() > max_len {
        return Err(error.into());
    }
    Ok(())
}

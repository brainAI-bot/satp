use anchor_lang::prelude::*;

declare_id!("4y4W2Mdfpu91C4iVowiDyJTmdKSjo8bmSDQrX2c84WQF");

#[program]
pub mod reputation {
    use super::*;

    pub fn recompute_reputation(ctx: Context<RecomputeReputation>) -> Result<()> {
        let review_count = ctx.remaining_accounts.len() as u32;
        let score = if review_count == 0 {
            BASE_SCORE
        } else {
            BASE_SCORE.saturating_add((review_count as u64).saturating_mul(REVIEW_WEIGHT))
                .min(MAX_SCORE)
        };

        let now = Clock::get()?.unix_timestamp;
        let identity = &mut ctx.accounts.identity;
        identity.reputation_score = score;
        identity.reputation_updated_at = now;
        identity.updated_at = now;

        emit!(ReputationRecomputed {
            agent_id: identity.agent_id,
            score,
            review_count,
            timestamp: now,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct RecomputeReputation<'info> {
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(seeds = [b"reputation_authority"], bump)]
    pub reputation_authority: UncheckedAccount<'info>,
    /// CHECK: Address is constrained to the SATP Identity Registry program.
    #[account(address = IDENTITY_PROGRAM_ID)]
    pub identity_program: UncheckedAccount<'info>,
    pub caller: Signer<'info>,
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

#[event]
pub struct ReputationRecomputed {
    pub agent_id: Pubkey,
    pub score: u64,
    pub review_count: u32,
    pub timestamp: i64,
}

#[error_code]
pub enum ReputationError {
    #[msg("Invalid review account")]
    InvalidReviewAccount,
}

const IDENTITY_PROGRAM_ID: Pubkey = pubkey!("EJtQh4Gyg88zXvSmFpxYkkeZsPwTsjfm4LvjmPQX1FD3");
const BASE_SCORE: u64 = 500_000;
const REVIEW_WEIGHT: u64 = 10_000;
const MAX_SCORE: u64 = 1_000_000;

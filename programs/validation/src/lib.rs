use anchor_lang::prelude::*;

declare_id!("8jLaqodAzfM7oCxP7aedFeszeNjnJ5ik56dzhDU2HQgc");

#[program]
pub mod validation {
    use super::*;

    pub fn recompute_level(ctx: Context<RecomputeLevel>) -> Result<()> {
        let attestation_count = ctx.remaining_accounts.len();
        let level = (attestation_count as u8).min(MAX_VERIFICATION_LEVEL);
        let attestation_types = Vec::new();

        let now = Clock::get()?.unix_timestamp;
        let identity = &mut ctx.accounts.identity;
        identity.verification_level = level;
        identity.verification_updated_at = now;
        identity.updated_at = now;

        emit!(VerificationRecomputed {
            agent_id: identity.agent_id,
            level,
            attestation_types,
            timestamp: now,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct RecomputeLevel<'info> {
    #[account(mut)]
    pub identity: Account<'info, AgentIdentity>,
    #[account(seeds = [b"validation_authority"], bump)]
    pub validation_authority: UncheckedAccount<'info>,
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
pub struct VerificationRecomputed {
    pub agent_id: Pubkey,
    pub level: u8,
    pub attestation_types: Vec<String>,
    pub timestamp: i64,
}

#[error_code]
pub enum ValidationError {
    #[msg("Invalid attestation account")]
    InvalidAttestationAccount,
}

const IDENTITY_PROGRAM_ID: Pubkey = pubkey!("EJtQh4Gyg88zXvSmFpxYkkeZsPwTsjfm4LvjmPQX1FD3");
const MAX_VERIFICATION_LEVEL: u8 = 5;

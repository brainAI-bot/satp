#![allow(unexpected_cfgs)]

#[cfg(all(feature = "devnet", feature = "mainnet"))]
compile_error!("enable at most one source identity feature");

use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

// Dependency-free CPI via declare_program! (Anchor 1.0)
// IDL files in idls/ directory — no Cargo path dependency needed
declare_program!(identity_v3);
use identity_v3::program::IdentityV3;
use identity_v3::accounts::GenesisRecord;

declare_program!(reviews_v3);
use reviews_v3::accounts::Review;

#[cfg(feature = "devnet")]
declare_id!("CtmZ1fHaypt3R6wbeiGawiRnjzRK9T8jsECk9mET9AK9");

#[cfg(not(feature = "devnet"))]
declare_id!("2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ");

const MAX_REVIEWS_PER_CALL: usize = 20;

/// Reviews program ID — remaining accounts must be owned by this program
/// Compile-time constant — no runtime .parse().unwrap() panic risk.
#[cfg(feature = "devnet")]
const REVIEWS_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0x2c, 0x2f, 0xd9, 0x32, 0xaa, 0x93, 0x51, 0x71, 0x16, 0x20, 0x9c, 0x9a, 0x19, 0xe0, 0x9a, 0xdf, 0x72, 0xe5, 0x2e, 0xd1, 0x47, 0x82, 0x67, 0xbe, 0x24, 0xe1, 0x6d, 0xe5, 0x17, 0xb7, 0x3c, 0xdf
]); // 3yVFrWCpBnQdWNqmiCG9EpoZq7WYeQ421Gx5sUh41Kwk (devnet)

#[cfg(not(feature = "devnet"))]
const REVIEWS_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0x0c, 0x97, 0x19, 0xa8, 0x59, 0x1e, 0x71, 0x26, 0xbb, 0x63, 0x45, 0x29, 0x6f, 0x3e, 0xbc, 0xd5, 0x04, 0x5c, 0x2b, 0x26, 0xd6, 0x39, 0x80, 0x36, 0x2e, 0xae, 0x50, 0x49, 0xba, 0x6a, 0xbf, 0x29
]); // r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4 (mainnet)


#[program]
pub mod reputation_v3 {
    use super::*;

    pub fn recompute_reputation(ctx: Context<RecomputeReputation>) -> Result<()> {
        let agent_hash = ctx.accounts.genesis.agent_id_hash;
        let mut ratings: Vec<(u8, i64)> = Vec::new();
        let now = Clock::get()?.unix_timestamp;

        // TD-005: Warn if remaining_accounts exceeds MAX_REVIEWS_PER_CALL (truncation)
        if ctx.remaining_accounts.len() > MAX_REVIEWS_PER_CALL {
            msg!("Warning: {} review accounts provided, only first {} will be processed",
                ctx.remaining_accounts.len(), MAX_REVIEWS_PER_CALL);
        }

        for account_info in ctx.remaining_accounts.iter().take(MAX_REVIEWS_PER_CALL) {
            // Security: verify account is owned by the reviews program
            if account_info.owner != &REVIEWS_PROGRAM_ID { continue; }

            let data = account_info.try_borrow_data()?;
            if data.len() < 8 { continue; }

            let mut disc = [0u8; 8];
            disc.copy_from_slice(&data[..8]);
            if disc != Review::DISCRIMINATOR { continue; }

            let review = Review::try_deserialize(&mut &data[..])
                .map_err(|_| ReputationError::InvalidReviewAccount)?;

            if review.agent_id_hash == agent_hash && review.is_active {
                ratings.push((review.rating, review.created_at));
            }
        }

        let score = compute_score(&ratings, now);

        let seeds = &[b"reputation_v3_authority".as_ref(), &[ctx.bumps.reputation_authority]];
        let signer_seeds = &[&seeds[..]];

        identity_v3::cpi::update_reputation(
            CpiContext::new_with_signer(
                ctx.accounts.identity_program.key(),
                identity_v3::cpi::accounts::UpdateReputation {
                    genesis: ctx.accounts.genesis.to_account_info(),
                    caller_authority: ctx.accounts.reputation_authority.to_account_info(),
                },
                signer_seeds,
            ),
            score,
        )?;

        emit!(ReputationRecomputed {
            agent_id_hash: agent_hash,
            score,
            review_count: ratings.len() as u32,
            timestamp: now,
        });

        Ok(())
    }
}

fn compute_score(ratings: &[(u8, i64)], now: i64) -> u64 {
    if ratings.is_empty() { return 500_000; }
    let mut weighted_sum: u128 = 0;
    let mut total_weight: u128 = 0;
    for &(rating, created_at) in ratings {
        let age_days = ((now - created_at).max(0) as u128) / 86400;
        let weight = 1_000_000u128 / (100 + age_days);
        let scaled = ((rating as u128).saturating_sub(1)) * 25;
        weighted_sum += scaled * weight;
        total_weight += weight;
    }
    if total_weight == 0 { return 500_000; }
    ((weighted_sum * 10_000) / total_weight).min(1_000_000) as u64
}

#[derive(Accounts)]
pub struct RecomputeReputation<'info> {
    #[account(mut)]
    pub genesis: Account<'info, GenesisRecord>,
    /// CHECK: PDA
    #[account(seeds = [b"reputation_v3_authority"], bump)]
    pub reputation_authority: UncheckedAccount<'info>,
    pub identity_program: Program<'info, IdentityV3>,
    pub caller: Signer<'info>,
}

#[event]
pub struct ReputationRecomputed {
    pub agent_id_hash: [u8; 32],
    pub score: u64,
    pub review_count: u32,
    pub timestamp: i64,
}

#[error_code]
pub enum ReputationError {
    #[msg("Invalid review account data")]
    InvalidReviewAccount,
}

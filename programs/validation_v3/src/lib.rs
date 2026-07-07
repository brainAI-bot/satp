use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

// Dependency-free CPI via declare_program! (Anchor 1.0)
// IDL files in idls/ directory — no Cargo path dependency needed
declare_program!(identity_v3);
use identity_v3::program::IdentityV3;
use identity_v3::accounts::GenesisRecord;

declare_program!(attestations_v3);
use attestations_v3::accounts::Attestation;

declare_id!("DLB76DzAFY8KNuvnP79BZW3cehGreEQTeGDvFCNd2Ekj");

const MAX_ATTESTATIONS_PER_CALL: usize = 20;

/// Attestations program ID — remaining accounts must be owned by this program
/// Compile-time constant — no runtime .parse().unwrap() panic risk.
const ATTESTATIONS_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    0x3c, 0x9a, 0xdf, 0x48, 0x1a, 0xf8, 0xc8, 0x9d,
    0x50, 0x8a, 0x31, 0x18, 0xe8, 0xa7, 0x27, 0xbf,
    0xe6, 0x00, 0xff, 0x21, 0x1c, 0x41, 0xf7, 0x6b,
    0x3a, 0xaa, 0x1d, 0x2e, 0xce, 0x71, 0x80, 0x3c,
]); // 55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw

#[program]
pub mod validation_v3 {
    use super::*;

    /// Verification levels (0-5):
    ///   0 = Unverified, 1 = Basic (1+), 2 = Standard (3+),
    ///   3 = Enhanced (5+, 2+ types), 4 = Premium (10+, 3+ types),
    ///   5 = Maximum (20+, 5+ types)
    pub fn recompute_level(ctx: Context<RecomputeLevel>) -> Result<()> {
        let agent_hash = ctx.accounts.genesis.agent_id_hash;
        let now = Clock::get()?.unix_timestamp;

        let mut verified_count: u32 = 0;
        let mut unique_types: Vec<String> = Vec::new();

        // TD-005: Warn if remaining_accounts exceeds MAX_ATTESTATIONS_PER_CALL (truncation)
        if ctx.remaining_accounts.len() > MAX_ATTESTATIONS_PER_CALL {
            msg!("Warning: {} attestation accounts provided, only first {} will be processed",
                ctx.remaining_accounts.len(), MAX_ATTESTATIONS_PER_CALL);
        }

        for info in ctx.remaining_accounts.iter().take(MAX_ATTESTATIONS_PER_CALL) {
            // Security: verify account is owned by the attestations program
            if info.owner != &ATTESTATIONS_PROGRAM_ID { continue; }

            let data = info.try_borrow_data()?;
            if data.len() < 8 { continue; }
            let mut disc = [0u8; 8];
            disc.copy_from_slice(&data[..8]);
            if disc != Attestation::DISCRIMINATOR { continue; }

            let att = Attestation::try_deserialize(&mut &data[..])
                .map_err(|_| ValidationError::InvalidAttestationAccount)?;

            if att.agent_id_hash == agent_hash && att.verified && !att.is_revoked {
                if let Some(exp) = att.expires_at {
                    if exp < now { continue; }
                }
                verified_count += 1;
                if !unique_types.contains(&att.attestation_type) {
                    unique_types.push(att.attestation_type);
                }
            }
        }

        let utc = unique_types.len() as u32;
        let level: u8 = if verified_count >= 20 && utc >= 5 { 5 }
            else if verified_count >= 10 && utc >= 3 { 4 }
            else if verified_count >= 5 && utc >= 2 { 3 }
            else if verified_count >= 3 { 2 }
            else if verified_count >= 1 { 1 }
            else { 0 };

        let seeds = &[b"validation_v3_authority".as_ref(), &[ctx.bumps.validation_authority]];
        let signer_seeds = &[&seeds[..]];

        identity_v3::cpi::update_verification(
            CpiContext::new_with_signer(
                ctx.accounts.identity_program.key(),
                identity_v3::cpi::accounts::UpdateVerification {
                    genesis: ctx.accounts.genesis.to_account_info(),
                    caller_authority: ctx.accounts.validation_authority.to_account_info(),
                },
                signer_seeds,
            ),
            level,
        )?;

        emit!(LevelRecomputed {
            agent_id_hash: agent_hash, level, verified_attestations: verified_count,
            unique_types: utc, timestamp: now,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RecomputeLevel<'info> {
    #[account(mut)]
    pub genesis: Account<'info, GenesisRecord>,
    /// CHECK: PDA
    #[account(seeds = [b"validation_v3_authority"], bump)]
    pub validation_authority: UncheckedAccount<'info>,
    pub identity_program: Program<'info, IdentityV3>,
    pub caller: Signer<'info>,
}

#[event]
pub struct LevelRecomputed {
    pub agent_id_hash: [u8; 32],
    pub level: u8,
    pub verified_attestations: u32,
    pub unique_types: u32,
    pub timestamp: i64,
}

#[error_code]
pub enum ValidationError {
    #[msg("Invalid attestation account data")]
    InvalidAttestationAccount,
}

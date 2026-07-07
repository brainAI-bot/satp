use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use solana_sha256_hasher::hash;

// Dependency-free CPI via declare_program! (Anchor 1.0)
declare_program!(identity_v3);
use identity_v3::program::IdentityV3;
use identity_v3::accounts::GenesisRecord;

declare_id!("55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw");

const MAX_ATTESTATIONS_PER_CALL: usize = 20;

/// Platform weights for attestation-based scoring.
/// Score = sum of weights for each verified, non-revoked, non-expired attestation type.
fn platform_weight(attestation_type: &str) -> u64 {
    match attestation_type.to_lowercase().as_str() {
        "github" => 50,
        "x" | "twitter" => 40,
        "solana" | "solana-wallet" => 30,
        "satp" => 20,
        "ethereum" | "eth" => 20,
        "domain" | "dns" => 20,
        "email" => 15,
        "telegram" => 15,
        "discord" => 15,
        "review" => 10,
        _ => 10, // Unknown platform types get base weight
    }
}

/// Compute verification level from attestation score.
/// L0 = no identity (handled by identity_v3)
/// L1 = Registered (set by identity_v3::create_identity)
/// L2 = score >= 50
/// L3 = score >= 100
/// L4 = score >= 150
/// L5 = score >= 200 (+ human verification, enforced off-chain)
fn score_to_level(score: u64) -> u8 {
    if score >= 200 { 5 }
    else if score >= 150 { 4 }
    else if score >= 100 { 3 }
    else if score >= 50 { 2 }
    else { 1 } // Minimum L1 if identity exists (caller already verified genesis)
}

/// Compute SHA-256 hash of agent_id for PDA seeds (matches identity_v3).
pub fn agent_id_hash(agent_id: &str) -> [u8; 32] {
    hash(agent_id.as_bytes()).to_bytes()
}

#[program]
pub mod attestations_v3 {
    use super::*;

    /// Create an attestation for an agent (identified by agent_id).
    /// PDA: `[b"attestation_v3", SHA256(agent_id), issuer, attestation_type]`
    pub fn create_attestation(
        ctx: Context<CreateAttestation>,
        agent_id: String,
        attestation_type: String,
        proof_data: String,
        expires_at: Option<i64>,
    ) -> Result<()> {
        require!(attestation_type.len() <= 64, AttestationError::TypeTooLong);
        require!(proof_data.len() <= 512, AttestationError::ProofDataTooLong);

        if let Some(exp) = expires_at {
            let now = Clock::get()?.unix_timestamp;
            require!(exp > now, AttestationError::ExpiryInPast);
        }

        let now = Clock::get()?.unix_timestamp;
        let attestation = &mut ctx.accounts.attestation;
        attestation.agent_id = agent_id;
        attestation.agent_id_hash = agent_id_hash(&attestation.agent_id);
        attestation.attestation_type = attestation_type;
        attestation.issuer = ctx.accounts.issuer.key();
        attestation.proof_data = proof_data;
        attestation.verified = false;
        attestation.created_at = now;
        attestation.expires_at = expires_at;
        attestation.is_revoked = false;
        attestation.bump = ctx.bumps.attestation;

        emit!(AttestationCreated {
            agent_id: attestation.agent_id.clone(),
            issuer: attestation.issuer,
            attestation_type: attestation.attestation_type.clone(),
            timestamp: now,
        });

        Ok(())
    }

    /// Create an attestation that is pre-verified (issuer self-verifies at creation).
    /// Same as create_attestation but sets verified = true.
    /// Use when the issuer IS the verification authority (e.g., platform backend).
    pub fn create_verified_attestation(
        ctx: Context<CreateAttestation>,
        agent_id: String,
        attestation_type: String,
        proof_data: String,
        expires_at: Option<i64>,
    ) -> Result<()> {
        require!(attestation_type.len() <= 64, AttestationError::TypeTooLong);
        require!(proof_data.len() <= 512, AttestationError::ProofDataTooLong);

        if let Some(exp) = expires_at {
            let now = Clock::get()?.unix_timestamp;
            require!(exp > now, AttestationError::ExpiryInPast);
        }

        let now = Clock::get()?.unix_timestamp;
        let attestation = &mut ctx.accounts.attestation;
        attestation.agent_id = agent_id;
        attestation.agent_id_hash = agent_id_hash(&attestation.agent_id);
        attestation.attestation_type = attestation_type;
        attestation.issuer = ctx.accounts.issuer.key();
        attestation.proof_data = proof_data;
        attestation.verified = true; // Pre-verified: issuer is signing this TX
        attestation.created_at = now;
        attestation.expires_at = expires_at;
        attestation.is_revoked = false;
        attestation.bump = ctx.bumps.attestation;

        emit!(AttestationCreated {
            agent_id: attestation.agent_id.clone(),
            issuer: attestation.issuer,
            attestation_type: attestation.attestation_type.clone(),
            timestamp: now,
        });

        Ok(())
    }

    /// Verify an attestation (issuer only).
    pub fn verify_attestation(ctx: Context<ManageAttestation>) -> Result<()> {
        let attestation = &mut ctx.accounts.attestation;
        require!(!attestation.is_revoked, AttestationError::AlreadyRevoked);
        attestation.verified = true;

        emit!(AttestationVerified {
            agent_id: attestation.agent_id.clone(),
            attestation_type: attestation.attestation_type.clone(),
            issuer: attestation.issuer,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Revoke an attestation (issuer only).
    pub fn revoke_attestation(ctx: Context<ManageAttestation>) -> Result<()> {
        let attestation = &mut ctx.accounts.attestation;
        attestation.is_revoked = true;
        attestation.verified = false;

        emit!(AttestationRevoked {
            agent_id: attestation.agent_id.clone(),
            attestation_type: attestation.attestation_type.clone(),
            issuer: attestation.issuer,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// CPI-only: Called by Reviews V3 to auto-create a review attestation.
    /// Auto-verified (programmatic attestation).
    pub fn create_review_attestation(
        ctx: Context<CreateReviewAttestation>,
        agent_id: String,
        reviewer: Pubkey,
        rating: u8,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let attestation = &mut ctx.accounts.attestation;
        attestation.agent_id = agent_id;
        attestation.agent_id_hash = agent_id_hash(&attestation.agent_id);
        attestation.attestation_type = "review".to_string();
        attestation.issuer = ctx.accounts.reviews_authority.key();
        attestation.proof_data = format!("reviewer:{},rating:{},ts:{}", reviewer, rating, now);
        attestation.verified = true; // Auto-verified
        attestation.created_at = now;
        attestation.expires_at = None;
        attestation.is_revoked = false;
        attestation.bump = ctx.bumps.attestation;

        emit!(AttestationCreated {
            agent_id: attestation.agent_id.clone(),
            issuer: attestation.issuer,
            attestation_type: "review".to_string(),
            timestamp: now,
        });

        Ok(())
    }

    /// Recompute attestation-based score and verification level for an agent.
    /// Reads all attestations for the agent (via remaining_accounts), computes:
    ///   - Score = sum of platform weights for verified, non-revoked, non-expired attestations
    ///   - Level = threshold-based on score (L1≥identity, L2≥50, L3≥100, L4≥150, L5≥200)
    /// Then CPIs to identity_v3::update_score_and_level to persist on the genesis PDA.
    /// Permissionless — anyone can trigger a recompute (read-only on attestations).
    pub fn recompute_score(ctx: Context<RecomputeScore>) -> Result<()> {
        let agent_hash = ctx.accounts.genesis.agent_id_hash;
        let now = Clock::get()?.unix_timestamp;

        let mut total_score: u64 = 0;
        let mut counted_types: Vec<String> = Vec::new();

        // TD-005: Warn if remaining_accounts exceeds MAX_ATTESTATIONS_PER_CALL (truncation)
        if ctx.remaining_accounts.len() > MAX_ATTESTATIONS_PER_CALL {
            msg!("Warning: {} attestation accounts provided, only first {} will be processed",
                ctx.remaining_accounts.len(), MAX_ATTESTATIONS_PER_CALL);
        }

        for info in ctx.remaining_accounts.iter().take(MAX_ATTESTATIONS_PER_CALL) {
            // Security: verify account is owned by this program (attestations_v3)
            if info.owner != &crate::ID { continue; }

            let data = info.try_borrow_data()?;
            if data.len() < 8 { continue; }
            let mut disc = [0u8; 8];
            disc.copy_from_slice(&data[..8]);
            if disc != Attestation::DISCRIMINATOR { continue; }

            let att = match Attestation::try_deserialize(&mut &data[..]) {
                Ok(a) => a,
                Err(_) => continue,
            };

            // Only count attestations for this agent that are verified and not revoked
            if att.agent_id_hash != agent_hash { continue; }
            if !att.verified || att.is_revoked { continue; }

            // Check expiry
            if let Some(exp) = att.expires_at {
                if exp < now { continue; }
            }

            // Each attestation type only counts once (dedup by type)
            let att_type_lower = att.attestation_type.to_lowercase();
            if !counted_types.contains(&att_type_lower) {
                total_score += platform_weight(&att.attestation_type);
                counted_types.push(att_type_lower);
            }
        }

        let level = score_to_level(total_score);

        // Scale score to identity's u64 range (multiply by 1000 for granularity)
        // Raw attestation score is 0..~500; identity score field is 0..1_000_000
        let scaled_score = (total_score * 1000).min(1_000_000);

        // CPI to identity_v3::update_score_and_level
        let seeds = &[b"attestations_v3_authority".as_ref(), &[ctx.bumps.attestations_authority]];
        let signer_seeds = &[&seeds[..]];

        identity_v3::cpi::update_score_and_level(
            CpiContext::new_with_signer(
                ctx.accounts.identity_program.key(),
                identity_v3::cpi::accounts::UpdateScoreAndLevel {
                    genesis: ctx.accounts.genesis.to_account_info(),
                    caller_authority: ctx.accounts.attestations_authority.to_account_info(),
                },
                signer_seeds,
            ),
            scaled_score,
            level,
        )?;

        emit!(ScoreRecomputed {
            agent_id_hash: agent_hash,
            raw_score: total_score,
            scaled_score,
            level,
            attestation_count: counted_types.len() as u32,
            timestamp: now,
        });

        Ok(())
    }
}

// ═════════════════════════════════════════════════
//  ACCOUNTS
// ═════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(agent_id: String, attestation_type: String)]
pub struct CreateAttestation<'info> {
    #[account(
        init,
        payer = issuer,
        space = Attestation::SPACE,
        seeds = [
            b"attestation_v3" as &[u8],
            &agent_id_hash(&agent_id) as &[u8],
            issuer.key().as_ref(),
            attestation_type.as_bytes(),
        ],
        bump,
    )]
    pub attestation: Account<'info, Attestation>,
    #[account(mut)]
    pub issuer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageAttestation<'info> {
    #[account(
        mut,
        has_one = issuer,
    )]
    pub attestation: Account<'info, Attestation>,
    pub issuer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(agent_id: String, reviewer: Pubkey)]
pub struct CreateReviewAttestation<'info> {
    #[account(
        init,
        payer = payer,
        space = Attestation::SPACE,
        seeds = [
            b"attestation_v3" as &[u8],
            &agent_id_hash(&agent_id) as &[u8],
            reviews_authority.key().as_ref(),
            b"review" as &[u8],
            reviewer.as_ref(),
        ],
        bump,
    )]
    pub attestation: Account<'info, Attestation>,
    /// Reviews program PDA authority — must sign via CPI
    pub reviews_authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecomputeScore<'info> {
    /// The agent's genesis record — will be updated via CPI
    #[account(mut)]
    pub genesis: Account<'info, GenesisRecord>,
    /// Attestations program PDA authority for CPI signing
    /// CHECK: PDA derived from [b"attestations_v3_authority"]
    #[account(seeds = [b"attestations_v3_authority"], bump)]
    pub attestations_authority: UncheckedAccount<'info>,
    /// Identity program for CPI
    pub identity_program: Program<'info, IdentityV3>,
    /// Permissionless caller — anyone can trigger recompute
    pub caller: Signer<'info>,
}

// ═════════════════════════════════════════════════
//  STATE
// ═════════════════════════════════════════════════

#[account]
pub struct Attestation {
    pub agent_id: String,           // 4 + 64 = 68
    pub agent_id_hash: [u8; 32],    // 32
    pub attestation_type: String,   // 4 + 64 = 68
    pub issuer: Pubkey,             // 32
    pub proof_data: String,         // 4 + 512 = 516
    pub verified: bool,             // 1
    pub created_at: i64,            // 8
    pub expires_at: Option<i64>,    // 1 + 8 = 9
    pub is_revoked: bool,           // 1
    pub bump: u8,                   // 1
}

impl Attestation {
    pub const SPACE: usize = 8     // discriminator
        + (4 + 64)                  // agent_id
        + 32                        // agent_id_hash
        + (4 + 64)                  // attestation_type
        + 32                        // issuer
        + (4 + 512)                 // proof_data
        + 1                         // verified
        + 8                         // created_at
        + 9                         // expires_at
        + 1                         // is_revoked
        + 1;                        // bump
}

// ═════════════════════════════════════════════════
//  EVENTS
// ═════════════════════════════════════════════════

#[event]
pub struct AttestationCreated {
    pub agent_id: String,
    pub issuer: Pubkey,
    pub attestation_type: String,
    pub timestamp: i64,
}

#[event]
pub struct AttestationVerified {
    pub agent_id: String,
    pub attestation_type: String,
    pub issuer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AttestationRevoked {
    pub agent_id: String,
    pub attestation_type: String,
    pub issuer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ScoreRecomputed {
    pub agent_id_hash: [u8; 32],
    pub raw_score: u64,
    pub scaled_score: u64,
    pub level: u8,
    pub attestation_count: u32,
    pub timestamp: i64,
}

// ═════════════════════════════════════════════════
//  ERRORS
// ═════════════════════════════════════════════════

#[error_code]
pub enum AttestationError {
    #[msg("Attestation type must be 64 characters or less")]
    TypeTooLong,
    #[msg("Proof data must be 512 characters or less")]
    ProofDataTooLong,
    #[msg("Expiry must be in the future")]
    ExpiryInPast,
    #[msg("Attestation already revoked")]
    AlreadyRevoked,
}

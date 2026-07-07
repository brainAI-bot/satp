use anchor_lang::prelude::*;

declare_id!("9xT3eNcndkmnqZtJqDQ1ggckHK7Dxo5EsAt5mHqsPBhP");

#[program]
pub mod attestations {
    use super::*;

    pub fn create_attestation(
        ctx: Context<CreateAttestation>,
        agent_id: Pubkey,
        attestation_type: String,
        proof_data: String,
        expires_at: Option<i64>,
    ) -> Result<()> {
        validate_string(
            &attestation_type,
            MAX_ATTESTATION_TYPE_LEN,
            AttestationError::TypeTooLong,
        )?;
        validate_string(&proof_data, MAX_PROOF_DATA_LEN, AttestationError::ProofDataTooLong)?;

        let now = Clock::get()?.unix_timestamp;
        if let Some(expires_at_value) = expires_at {
            require!(expires_at_value > now, AttestationError::ExpiryInPast);
        }

        let attestation = &mut ctx.accounts.attestation;
        attestation.agent_id = agent_id;
        attestation.attestation_type = attestation_type.clone();
        attestation.issuer = ctx.accounts.issuer.key();
        attestation.proof_data = proof_data;
        attestation.verified = false;
        attestation.created_at = now;
        attestation.expires_at = expires_at;
        attestation.is_revoked = false;
        attestation.bump = ctx.bumps.attestation;

        emit!(AttestationCreated {
            agent_id,
            issuer: attestation.issuer,
            attestation_type,
            timestamp: now,
        });

        Ok(())
    }

    pub fn revoke_attestation(ctx: Context<ManageAttestation>) -> Result<()> {
        let attestation = &mut ctx.accounts.attestation;
        require!(!attestation.is_revoked, AttestationError::AlreadyRevoked);
        attestation.is_revoked = true;
        attestation.verified = false;

        emit!(AttestationRevoked {
            agent_id: attestation.agent_id,
            attestation_type: attestation.attestation_type.clone(),
            issuer: attestation.issuer,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn verify_attestation(ctx: Context<ManageAttestation>) -> Result<()> {
        let attestation = &mut ctx.accounts.attestation;
        require!(!attestation.is_revoked, AttestationError::AlreadyRevoked);
        if let Some(expires_at) = attestation.expires_at {
            require!(
                Clock::get()?.unix_timestamp < expires_at,
                AttestationError::ExpiryInPast
            );
        }

        attestation.verified = true;

        emit!(AttestationVerified {
            agent_id: attestation.agent_id,
            attestation_type: attestation.attestation_type.clone(),
            issuer: attestation.issuer,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(agent_id: Pubkey, attestation_type: String)]
pub struct CreateAttestation<'info> {
    #[account(
        init,
        payer = issuer,
        space = Attestation::SPACE,
        seeds = [
            b"attestation",
            agent_id.as_ref(),
            issuer.key().as_ref(),
            attestation_type.as_bytes()
        ],
        bump
    )]
    pub attestation: Account<'info, Attestation>,
    #[account(mut)]
    pub issuer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageAttestation<'info> {
    #[account(mut, has_one = issuer @ AttestationError::AlreadyRevoked)]
    pub attestation: Account<'info, Attestation>,
    pub issuer: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Attestation {
    pub agent_id: Pubkey,
    #[max_len(64)]
    pub attestation_type: String,
    pub issuer: Pubkey,
    #[max_len(1024)]
    pub proof_data: String,
    pub verified: bool,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub is_revoked: bool,
    pub bump: u8,
}

impl Attestation {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[event]
pub struct AttestationCreated {
    pub agent_id: Pubkey,
    pub issuer: Pubkey,
    pub attestation_type: String,
    pub timestamp: i64,
}

#[event]
pub struct AttestationRevoked {
    pub agent_id: Pubkey,
    pub attestation_type: String,
    pub issuer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AttestationVerified {
    pub agent_id: Pubkey,
    pub attestation_type: String,
    pub issuer: Pubkey,
    pub timestamp: i64,
}

#[error_code]
pub enum AttestationError {
    #[msg("Attestation type exceeds max length")]
    TypeTooLong,
    #[msg("Proof data exceeds max length")]
    ProofDataTooLong,
    #[msg("Attestation expiration is in the past")]
    ExpiryInPast,
    #[msg("Attestation has already been revoked")]
    AlreadyRevoked,
}

const MAX_ATTESTATION_TYPE_LEN: usize = 64;
const MAX_PROOF_DATA_LEN: usize = 1024;

fn validate_string(value: &str, max_len: usize, error: AttestationError) -> Result<()> {
    if value.len() > max_len {
        return Err(error.into());
    }
    Ok(())
}

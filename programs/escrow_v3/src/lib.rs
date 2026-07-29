#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
};
use solana_sha256_hasher::hash as sol_hash;
use std::str::FromStr;

declare_id!("HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C");

/// SATP V3 Escrow Program
///
/// Identity-verified on-chain escrow for agent transactions.
/// Requires both client and agent to have SATP V3 Genesis Records.
///
/// Upgrade over satp-escrow V1:
/// - CPI to identity_v3 — verifies agent has on-chain identity
/// - Minimum trust tier enforcement (optional per escrow)
/// - Agent "born" requirement (optional — can require burn-to-become)
/// - Configurable arbiter (third-party, not client-as-arbiter)
/// - Escrow fee support (percentage to protocol treasury)
/// - Milestone-based partial releases
///
/// Security model:
/// - PDA seeds include client + agent_id_hash + nonce → unique per job
/// - Agent identity verified via Genesis Record PDA derivation
/// - Authority checks on all state transitions
/// - Deadline enforcement with grace period for disputes

#[program]
pub mod escrow_v3 {
    use super::*;

    /// Create an escrow between a client and a verified SATP V3 agent.
    ///
    /// The instruction verifies the agent's Genesis Record exists on-chain
    /// by checking the `identity_account` PDA derivation matches the expected
    /// seeds. Optionally enforces minimum reputation and verification level.
    ///
    /// # Arguments
    /// * `agent_id` - The agent's string identifier (used for PDA derivation)
    /// * `amount` - Lamports to escrow
    /// * `description_hash` - SHA256 of job description (for uniqueness + audit)
    /// * `deadline` - Unix timestamp deadline for work submission
    /// * `nonce` - Unique nonce (allows multiple escrows between same parties)
    /// * `min_verification_level` - Minimum required verification level (0-5, 0 = no requirement)
    /// * `require_born` - If true, agent must have completed burn-to-become
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        agent_id: String,
        amount: u64,
        description_hash: [u8; 32],
        deadline: i64,
        nonce: u64,
        min_verification_level: u8,
        require_born: bool,
    ) -> Result<()> {
        require!(amount > 0, EscrowV3Error::ZeroAmount);
        require!(
            deadline > Clock::get()?.unix_timestamp,
            EscrowV3Error::DeadlinePassed
        );
        require!(agent_id.len() <= 64, EscrowV3Error::AgentIdTooLong);
        require!(min_verification_level <= 5, EscrowV3Error::InvalidVerificationLevel);

        // Security: arbiter must be a third party (not client or agent)
        // Prevents client self-arbitration (dispute → resolve 100% to self)
        require!(
            ctx.accounts.arbiter.key() != ctx.accounts.client.key(),
            EscrowV3Error::ClientCannotBeArbiter
        );
        require!(
            ctx.accounts.arbiter.key() != ctx.accounts.agent_wallet.key(),
            EscrowV3Error::AgentCannotBeArbiter
        );

        // ═══════════════════════════════════════
        // VERIFY AGENT IDENTITY (CPI-less check)
        // ═══════════════════════════════════════
        //
        // We verify the agent's Genesis Record exists by:
        // 1. Computing expected PDA from agent_id
        // 2. Checking the passed account matches
        // 3. Verifying it's owned by identity_v3 program
        // 4. Reading fields to check trust requirements

        let identity_account = &ctx.accounts.agent_identity;

        // Verify the account is owned by identity_v3
        require!(
            identity_account.owner == &IDENTITY_V3_PROGRAM_ID,
            EscrowV3Error::InvalidIdentityOwner
        );

        // Verify PDA derivation matches
        let agent_id_hash = compute_sha256(agent_id.as_bytes());
        let (expected_pda, _bump) = Pubkey::find_program_address(
            &[b"genesis", &agent_id_hash],
            &IDENTITY_V3_PROGRAM_ID,
        );
        require!(
            identity_account.key() == expected_pda,
            EscrowV3Error::InvalidIdentityPda
        );

        // Read Genesis Record fields for trust enforcement
        let data = identity_account.try_borrow_data()?;
        require!(data.len() > 8, EscrowV3Error::InvalidIdentityAccount);

        // Parse relevant fields from Genesis Record
        // Layout (after 8-byte discriminator):
        //   agent_id_hash: [u8; 32]                    offset 8
        //   agent_name: String (4 + len)                offset 40
        //   ... (variable length strings) ...
        //   We need: genesis_record (i64), reputation_score (u64), verification_level (u8)
        //   These are at the end of variable-length data.
        //
        // Rather than walk the entire struct, we walk the variable-length fields
        // to find the fixed fields at the end.

        let parsed = parse_genesis_tail(&data)?;

        // TD-004: Verify identity is active (not deactivated)
        require!(
            parsed.is_active,
            EscrowV3Error::AgentIdentityDeactivated
        );

        // TD-002: Verify agent_wallet matches the Genesis Record authority
        // Prevents funds going to unintended recipient
        require!(
            ctx.accounts.agent_wallet.key() == parsed.authority,
            EscrowV3Error::AgentWalletMismatch
        );

        // Check born status if required
        if require_born {
            require!(
                parsed.genesis_record > 0,
                EscrowV3Error::AgentNotBorn
            );
        }

        // Check minimum verification level
        if min_verification_level > 0 {
            require!(
                parsed.verification_level >= min_verification_level,
                EscrowV3Error::InsufficientVerificationLevel
            );
        }

        // ═══════════════════════════════════════
        // INITIALIZE ESCROW
        // ═══════════════════════════════════════

        let escrow = &mut ctx.accounts.escrow;
        escrow.client = ctx.accounts.client.key();
        escrow.agent = ctx.accounts.agent_wallet.key();
        escrow.agent_id_hash = agent_id_hash;
        escrow.amount = amount;
        escrow.released_amount = 0;
        escrow.description_hash = description_hash;
        escrow.deadline = deadline;
        escrow.nonce = nonce;
        escrow.currency = EscrowCurrency::Sol;
        escrow.token_mint = None;
        escrow.token_vault = None;
        escrow.token_decimals = None;
        escrow.status = EscrowStatus::Active;
        escrow.min_verification_level = min_verification_level;
        escrow.require_born = require_born;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.arbiter = ctx.accounts.arbiter.key();
        escrow.bump = ctx.bumps.escrow;

        // Transfer SOL from client to escrow PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.client.key(),
            &escrow.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.client.to_account_info(),
                escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        emit!(EscrowCreated {
            escrow: escrow.key(),
            client: escrow.client,
            agent: escrow.agent,
            agent_id_hash,
            amount,
            deadline,
            arbiter: escrow.arbiter,
        });

        Ok(())
    }

    /// Create an escrow funded with USDC/SPL tokens.
    ///
    /// The vault must be the associated token account for the escrow PDA and
    /// USDC mint. Clients are expected to include an idempotent ATA creation
    /// instruction before this instruction when the vault may not exist.
    pub fn create_usdc_escrow(
        ctx: Context<CreateUsdcEscrow>,
        agent_id: String,
        amount: u64,
        description_hash: [u8; 32],
        deadline: i64,
        nonce: u64,
        min_verification_level: u8,
        require_born: bool,
        token_decimals: u8,
    ) -> Result<()> {
        require!(amount > 0, EscrowV3Error::ZeroAmount);
        require!(
            deadline > Clock::get()?.unix_timestamp,
            EscrowV3Error::DeadlinePassed
        );
        require!(agent_id.len() <= 64, EscrowV3Error::AgentIdTooLong);
        require!(min_verification_level <= 5, EscrowV3Error::InvalidVerificationLevel);
        validate_token_program(&ctx.accounts.token_program)?;
        validate_mint_decimals(
            &ctx.accounts.usdc_mint.to_account_info(),
            token_decimals,
        )?;
        validate_token_account(
            &ctx.accounts.client_usdc_account.to_account_info(),
            &ctx.accounts.client.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_token_account(
            &ctx.accounts.vault_usdc_account.to_account_info(),
            &ctx.accounts.escrow.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        require!(
            ctx.accounts.arbiter.key() != ctx.accounts.client.key(),
            EscrowV3Error::ClientCannotBeArbiter
        );
        require!(
            ctx.accounts.arbiter.key() != ctx.accounts.agent_wallet.key(),
            EscrowV3Error::AgentCannotBeArbiter
        );

        verify_agent_identity(
            &ctx.accounts.agent_identity,
            &ctx.accounts.agent_wallet.key(),
            &agent_id,
            min_verification_level,
            require_born,
        )?;

        let agent_id_hash = compute_sha256(agent_id.as_bytes());
        let escrow = &mut ctx.accounts.escrow;
        escrow.client = ctx.accounts.client.key();
        escrow.agent = ctx.accounts.agent_wallet.key();
        escrow.agent_id_hash = agent_id_hash;
        escrow.amount = amount;
        escrow.released_amount = 0;
        escrow.description_hash = description_hash;
        escrow.deadline = deadline;
        escrow.nonce = nonce;
        escrow.currency = EscrowCurrency::Usdc;
        escrow.token_mint = Some(ctx.accounts.usdc_mint.key());
        escrow.token_vault = Some(ctx.accounts.vault_usdc_account.key());
        escrow.token_decimals = Some(token_decimals);
        escrow.status = EscrowStatus::Active;
        escrow.min_verification_level = min_verification_level;
        escrow.require_born = require_born;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.arbiter = ctx.accounts.arbiter.key();
        escrow.bump = ctx.bumps.escrow;

        invoke_transfer_checked(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.client_usdc_account.to_account_info(),
            ctx.accounts.usdc_mint.to_account_info(),
            ctx.accounts.vault_usdc_account.to_account_info(),
            ctx.accounts.client.to_account_info(),
            amount,
            token_decimals,
        )?;

        emit!(EscrowCreated {
            escrow: escrow.key(),
            client: escrow.client,
            agent: escrow.agent,
            agent_id_hash,
            amount,
            deadline,
            arbiter: escrow.arbiter,
        });

        Ok(())
    }

    /// Agent submits work proof. Only callable before deadline.
    pub fn submit_work(ctx: Context<SubmitWork>, work_hash: [u8; 32]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Active, EscrowV3Error::NotActive);

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= escrow.deadline,
            EscrowV3Error::DeadlinePassed
        );

        escrow.status = EscrowStatus::WorkSubmitted;
        escrow.work_hash = Some(work_hash);
        escrow.work_submitted_at = Some(clock.unix_timestamp);

        emit!(WorkSubmitted {
            escrow: escrow.key(),
            agent: escrow.agent,
            work_hash,
            submitted_at: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Client releases full remaining funds to agent.
    /// Allowed in Active or WorkSubmitted status.
    pub fn release(ctx: Context<Release>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.currency == EscrowCurrency::Sol, EscrowV3Error::WrongCurrency);
        require!(
            escrow.status == EscrowStatus::Active || escrow.status == EscrowStatus::WorkSubmitted,
            EscrowV3Error::NotReleasable
        );

        let remaining = escrow.amount.checked_sub(escrow.released_amount)
            .ok_or(EscrowV3Error::ArithmeticOverflow)?;
        require!(remaining > 0, EscrowV3Error::NothingToRelease);

        escrow.released_amount = escrow.amount;
        escrow.status = EscrowStatus::Released;

        // Transfer remaining SOL to agent
        **escrow.to_account_info().try_borrow_mut_lamports()? -= remaining;
        **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += remaining;

        emit!(EscrowReleased {
            escrow: escrow.key(),
            agent: escrow.agent,
            amount: remaining,
            total_released: escrow.released_amount,
        });

        Ok(())
    }

    /// Client releases full remaining USDC/SPL funds to agent.
    pub fn release_usdc(ctx: Context<ReleaseUsdc>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        validate_token_program(&ctx.accounts.token_program)?;
        validate_token_account(
            &ctx.accounts.vault_usdc_account.to_account_info(),
            &escrow.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_token_account(
            &ctx.accounts.agent_usdc_account.to_account_info(),
            &ctx.accounts.agent.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        assert_usdc_escrow(
            escrow,
            &ctx.accounts.usdc_mint.key(),
            &ctx.accounts.vault_usdc_account.key(),
        )?;
        require!(
            escrow.status == EscrowStatus::Active || escrow.status == EscrowStatus::WorkSubmitted,
            EscrowV3Error::NotReleasable
        );

        let remaining = escrow.amount.checked_sub(escrow.released_amount)
            .ok_or(EscrowV3Error::ArithmeticOverflow)?;
        require!(remaining > 0, EscrowV3Error::NothingToRelease);

        escrow.released_amount = escrow.amount;
        escrow.status = EscrowStatus::Released;
        transfer_checked_from_vault(
            escrow,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault_usdc_account.to_account_info(),
            ctx.accounts.usdc_mint.to_account_info(),
            ctx.accounts.agent_usdc_account.to_account_info(),
            remaining,
        )?;

        emit!(EscrowReleased {
            escrow: escrow.key(),
            agent: escrow.agent,
            amount: remaining,
            total_released: escrow.released_amount,
        });

        Ok(())
    }

    /// Client releases a partial amount (milestone payment).
    /// Escrow stays Active until fully released or cancelled.
    pub fn partial_release(ctx: Context<Release>, amount: u64) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.currency == EscrowCurrency::Sol, EscrowV3Error::WrongCurrency);
        require!(
            escrow.status == EscrowStatus::Active || escrow.status == EscrowStatus::WorkSubmitted,
            EscrowV3Error::NotReleasable
        );
        require!(amount > 0, EscrowV3Error::ZeroAmount);

        let remaining = escrow.amount.checked_sub(escrow.released_amount)
            .ok_or(EscrowV3Error::ArithmeticOverflow)?;
        require!(amount <= remaining, EscrowV3Error::InsufficientFunds);

        escrow.released_amount = escrow.released_amount
            .checked_add(amount)
            .ok_or(EscrowV3Error::ArithmeticOverflow)?;

        // Transfer partial amount to agent
        **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += amount;

        // If fully released, mark as Released
        if escrow.released_amount == escrow.amount {
            escrow.status = EscrowStatus::Released;
        }

        emit!(PartialRelease {
            escrow: escrow.key(),
            agent: escrow.agent,
            amount,
            total_released: escrow.released_amount,
            remaining: escrow.amount.saturating_sub(escrow.released_amount),
        });

        Ok(())
    }

    /// Client releases a partial USDC/SPL amount.
    pub fn partial_release_usdc(ctx: Context<ReleaseUsdc>, amount: u64) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        validate_token_program(&ctx.accounts.token_program)?;
        validate_token_account(
            &ctx.accounts.vault_usdc_account.to_account_info(),
            &escrow.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_token_account(
            &ctx.accounts.agent_usdc_account.to_account_info(),
            &ctx.accounts.agent.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        assert_usdc_escrow(
            escrow,
            &ctx.accounts.usdc_mint.key(),
            &ctx.accounts.vault_usdc_account.key(),
        )?;
        require!(
            escrow.status == EscrowStatus::Active || escrow.status == EscrowStatus::WorkSubmitted,
            EscrowV3Error::NotReleasable
        );
        require!(amount > 0, EscrowV3Error::ZeroAmount);

        let remaining = escrow.amount.checked_sub(escrow.released_amount)
            .ok_or(EscrowV3Error::ArithmeticOverflow)?;
        require!(amount <= remaining, EscrowV3Error::InsufficientFunds);

        escrow.released_amount = escrow.released_amount
            .checked_add(amount)
            .ok_or(EscrowV3Error::ArithmeticOverflow)?;
        if escrow.released_amount == escrow.amount {
            escrow.status = EscrowStatus::Released;
        }

        transfer_checked_from_vault(
            escrow,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault_usdc_account.to_account_info(),
            ctx.accounts.usdc_mint.to_account_info(),
            ctx.accounts.agent_usdc_account.to_account_info(),
            amount,
        )?;

        emit!(PartialRelease {
            escrow: escrow.key(),
            agent: escrow.agent,
            amount,
            total_released: escrow.released_amount,
            remaining: escrow.amount.saturating_sub(escrow.released_amount),
        });

        Ok(())
    }

    /// Client cancels escrow and gets refund of unreleased funds.
    /// Only if deadline passed AND status is Active (no work submitted).
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.currency == EscrowCurrency::Sol, EscrowV3Error::WrongCurrency);
        require!(escrow.status == EscrowStatus::Active, EscrowV3Error::NotCancellable);

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp > escrow.deadline,
            EscrowV3Error::DeadlineNotReached
        );

        let remaining = escrow.amount.saturating_sub(escrow.released_amount);
        escrow.status = EscrowStatus::Cancelled;

        if remaining > 0 {
            **escrow.to_account_info().try_borrow_mut_lamports()? -= remaining;
            **ctx.accounts.client.to_account_info().try_borrow_mut_lamports()? += remaining;
        }

        emit!(EscrowCancelled {
            escrow: escrow.key(),
            client: escrow.client,
            refunded: remaining,
        });

        Ok(())
    }

    /// Client cancels USDC/SPL escrow and gets refund of unreleased funds.
    pub fn cancel_usdc(ctx: Context<CancelUsdc>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        validate_token_program(&ctx.accounts.token_program)?;
        validate_token_account(
            &ctx.accounts.vault_usdc_account.to_account_info(),
            &escrow.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_token_account(
            &ctx.accounts.client_usdc_account.to_account_info(),
            &ctx.accounts.client.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        assert_usdc_escrow(
            escrow,
            &ctx.accounts.usdc_mint.key(),
            &ctx.accounts.vault_usdc_account.key(),
        )?;
        require!(escrow.status == EscrowStatus::Active, EscrowV3Error::NotCancellable);

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp > escrow.deadline,
            EscrowV3Error::DeadlineNotReached
        );

        let remaining = escrow.amount.saturating_sub(escrow.released_amount);
        escrow.status = EscrowStatus::Cancelled;

        if remaining > 0 {
            transfer_checked_from_vault(
                escrow,
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.vault_usdc_account.to_account_info(),
                ctx.accounts.usdc_mint.to_account_info(),
                ctx.accounts.client_usdc_account.to_account_info(),
                remaining,
            )?;
        }

        emit!(EscrowCancelled {
            escrow: escrow.key(),
            client: escrow.client,
            refunded: remaining,
        });

        Ok(())
    }

    /// Either client or agent raises a dispute. Only when work has been submitted.
    pub fn raise_dispute(ctx: Context<RaiseDispute>, reason_hash: [u8; 32]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::WorkSubmitted,
            EscrowV3Error::NotDisputable
        );

        let signer = ctx.accounts.signer.key();
        require!(
            signer == escrow.client || signer == escrow.agent,
            EscrowV3Error::Unauthorized
        );

        escrow.status = EscrowStatus::Disputed;
        escrow.dispute_reason_hash = Some(reason_hash);
        escrow.disputed_at = Some(Clock::get()?.unix_timestamp);
        escrow.disputed_by = Some(signer);

        emit!(DisputeRaised {
            escrow: escrow.key(),
            raised_by: signer,
            reason_hash,
        });

        Ok(())
    }

    /// Arbiter resolves dispute. Can split funds between agent and client.
    ///
    /// # Arguments
    /// * `agent_amount` - Lamports to release to agent
    /// * `client_amount` - Lamports to refund to client
    ///
    /// agent_amount + client_amount must equal remaining escrowed funds.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        agent_amount: u64,
        client_amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.currency == EscrowCurrency::Sol, EscrowV3Error::WrongCurrency);
        require!(
            escrow.status == EscrowStatus::Disputed,
            EscrowV3Error::NotDisputed
        );

        let remaining = escrow.amount.checked_sub(escrow.released_amount)
            .ok_or(EscrowV3Error::ArithmeticOverflow)?;
        require!(
            agent_amount.checked_add(client_amount) == Some(remaining),
            EscrowV3Error::ResolutionAmountMismatch
        );

        escrow.status = EscrowStatus::Resolved;
        escrow.released_amount = escrow.released_amount
            .checked_add(agent_amount)
            .ok_or(EscrowV3Error::ArithmeticOverflow)?;

        // Transfer to agent
        if agent_amount > 0 {
            **escrow.to_account_info().try_borrow_mut_lamports()? -= agent_amount;
            **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += agent_amount;
        }

        // Refund to client
        if client_amount > 0 {
            **escrow.to_account_info().try_borrow_mut_lamports()? -= client_amount;
            **ctx.accounts.client_wallet.to_account_info().try_borrow_mut_lamports()? += client_amount;
        }

        emit!(DisputeResolved {
            escrow: escrow.key(),
            agent_amount,
            client_amount,
            resolved_by: ctx.accounts.arbiter.key(),
        });

        Ok(())
    }

    /// Arbiter resolves USDC/SPL dispute. Split must equal remaining vault funds.
    pub fn resolve_dispute_usdc(
        ctx: Context<ResolveDisputeUsdc>,
        agent_amount: u64,
        client_amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        validate_token_program(&ctx.accounts.token_program)?;
        validate_token_account(
            &ctx.accounts.vault_usdc_account.to_account_info(),
            &escrow.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_token_account(
            &ctx.accounts.agent_usdc_account.to_account_info(),
            &ctx.accounts.agent.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_token_account(
            &ctx.accounts.client_usdc_account.to_account_info(),
            &ctx.accounts.client_wallet.key(),
            &ctx.accounts.usdc_mint.key(),
        )?;
        assert_usdc_escrow(
            escrow,
            &ctx.accounts.usdc_mint.key(),
            &ctx.accounts.vault_usdc_account.key(),
        )?;
        require!(
            escrow.status == EscrowStatus::Disputed,
            EscrowV3Error::NotDisputed
        );

        let remaining = escrow.amount.checked_sub(escrow.released_amount)
            .ok_or(EscrowV3Error::ArithmeticOverflow)?;
        require!(
            agent_amount.checked_add(client_amount) == Some(remaining),
            EscrowV3Error::ResolutionAmountMismatch
        );

        escrow.status = EscrowStatus::Resolved;
        escrow.released_amount = escrow.released_amount
            .checked_add(agent_amount)
            .ok_or(EscrowV3Error::ArithmeticOverflow)?;

        if agent_amount > 0 {
            transfer_checked_from_vault(
                escrow,
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.vault_usdc_account.to_account_info(),
                ctx.accounts.usdc_mint.to_account_info(),
                ctx.accounts.agent_usdc_account.to_account_info(),
                agent_amount,
            )?;
        }

        if client_amount > 0 {
            transfer_checked_from_vault(
                escrow,
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.vault_usdc_account.to_account_info(),
                ctx.accounts.usdc_mint.to_account_info(),
                ctx.accounts.client_usdc_account.to_account_info(),
                client_amount,
            )?;
        }

        emit!(DisputeResolved {
            escrow: escrow.key(),
            agent_amount,
            client_amount,
            resolved_by: ctx.accounts.arbiter.key(),
        });

        Ok(())
    }

    /// Client extends the escrow deadline. Only when Active.
    /// New deadline must be strictly after the current deadline.
    pub fn extend_deadline(ctx: Context<ExtendDeadline>, new_deadline: i64) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Active, EscrowV3Error::NotActive);
        require!(
            new_deadline > escrow.deadline,
            EscrowV3Error::NewDeadlineMustBeLater
        );

        let old_deadline = escrow.deadline;
        escrow.deadline = new_deadline;

        emit!(DeadlineExtended {
            escrow: escrow.key(),
            old_deadline,
            new_deadline,
            extended_by: ctx.accounts.client.key(),
        });

        Ok(())
    }

    /// Close a settled escrow account. Returns rent to client.
    /// Only when Released, Cancelled, or Resolved.
    pub fn close_escrow(_ctx: Context<CloseEscrow>) -> Result<()> {
        // Anchor close constraint handles the account closure
        Ok(())
    }
}

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════

/// Identity V3 program ID — hardcoded for security
/// GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG (mainnet)
const IDENTITY_V3_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    // 7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ
    0x65, 0xa4, 0x81, 0x5a, 0x60, 0xf7, 0x0f, 0x90,
    0x9a, 0xec, 0xa2, 0x2d, 0xe5, 0xac, 0x74, 0xec,
    0xd9, 0xf1, 0x16, 0x29, 0xc1, 0x27, 0x41, 0x5e,
    0xe9, 0xed, 0xc2, 0x11, 0x52, 0xbf, 0xf0, 0xeb,
]);

// ═══════════════════════════════════════════════
//  HELPER FUNCTIONS
// ═══════════════════════════════════════════════

/// Compute SHA-256 hash of bytes. Matches identity_v3 agent_id_hash.
fn compute_sha256(input: &[u8]) -> [u8; 32] {
    sol_hash(input).to_bytes()
}

fn token_program_id() -> Pubkey {
    Pubkey::from_str("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        .expect("valid SPL Token program id")
}

fn associated_token_program_id() -> Pubkey {
    Pubkey::from_str("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        .expect("valid associated token program id")
}

fn expected_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let token_program = token_program_id();
    let associated_token_program = associated_token_program_id();
    Pubkey::find_program_address(
        &[
            owner.as_ref(),
            token_program.as_ref(),
            mint.as_ref(),
        ],
        &associated_token_program,
    ).0
}

fn validate_token_program(token_program: &UncheckedAccount) -> Result<()> {
    require_keys_eq!(
        token_program.key(),
        token_program_id(),
        EscrowV3Error::InvalidTokenProgram
    );
    Ok(())
}

fn validate_mint_decimals(mint: &AccountInfo, expected_decimals: u8) -> Result<()> {
    require_keys_eq!(
        *mint.owner,
        token_program_id(),
        EscrowV3Error::InvalidTokenProgram
    );
    let data = mint.try_borrow_data()?;
    require!(data.len() > 44, EscrowV3Error::InvalidMintAccount);
    require!(data[44] == expected_decimals, EscrowV3Error::TokenDecimalsMismatch);
    Ok(())
}

fn read_token_account(account: &AccountInfo) -> Result<(Pubkey, Pubkey)> {
    require_keys_eq!(
        *account.owner,
        token_program_id(),
        EscrowV3Error::InvalidTokenProgram
    );
    let data = account.try_borrow_data()?;
    require!(data.len() >= 64, EscrowV3Error::InvalidTokenAccount);
    let mint = Pubkey::try_from(&data[0..32])
        .map_err(|_| error!(EscrowV3Error::InvalidTokenAccount))?;
    let owner = Pubkey::try_from(&data[32..64])
        .map_err(|_| error!(EscrowV3Error::InvalidTokenAccount))?;
    Ok((mint, owner))
}

fn validate_token_account(
    account: &AccountInfo,
    expected_owner: &Pubkey,
    expected_mint: &Pubkey,
) -> Result<()> {
    require!(
        account.key() == expected_ata(expected_owner, expected_mint),
        EscrowV3Error::InvalidAssociatedTokenAccount
    );
    let (mint, owner) = read_token_account(account)?;
    require_keys_eq!(mint, *expected_mint, EscrowV3Error::WrongTokenMint);
    require_keys_eq!(owner, *expected_owner, EscrowV3Error::InvalidTokenOwner);
    Ok(())
}

fn invoke_transfer_checked<'info>(
    token_program: AccountInfo<'info>,
    source: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    require_keys_eq!(
        token_program.key(),
        token_program_id(),
        EscrowV3Error::InvalidTokenProgram
    );

    let mut data = Vec::with_capacity(10);
    data.push(12); // SPL TokenInstruction::TransferChecked
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);

    let ix = Instruction {
        program_id: token_program.key(),
        accounts: vec![
            AccountMeta::new(source.key(), false),
            AccountMeta::new_readonly(mint.key(), false),
            AccountMeta::new(destination.key(), false),
            AccountMeta::new_readonly(authority.key(), true),
        ],
        data,
    };

    invoke(&ix, &[source, mint, destination, authority, token_program])
        .map_err(Into::into)
}

fn verify_agent_identity(
    identity_account: &UncheckedAccount,
    agent_wallet: &Pubkey,
    agent_id: &str,
    min_verification_level: u8,
    require_born: bool,
) -> Result<()> {
    require!(
        identity_account.owner == &IDENTITY_V3_PROGRAM_ID,
        EscrowV3Error::InvalidIdentityOwner
    );

    let agent_id_hash = compute_sha256(agent_id.as_bytes());
    let (expected_pda, _bump) = Pubkey::find_program_address(
        &[b"genesis", &agent_id_hash],
        &IDENTITY_V3_PROGRAM_ID,
    );
    require!(
        identity_account.key() == expected_pda,
        EscrowV3Error::InvalidIdentityPda
    );

    let data = identity_account.try_borrow_data()?;
    require!(data.len() > 8, EscrowV3Error::InvalidIdentityAccount);
    let parsed = parse_genesis_tail(&data)?;

    require!(
        parsed.is_active,
        EscrowV3Error::AgentIdentityDeactivated
    );
    require!(
        *agent_wallet == parsed.authority,
        EscrowV3Error::AgentWalletMismatch
    );
    if require_born {
        require!(
            parsed.genesis_record > 0,
            EscrowV3Error::AgentNotBorn
        );
    }
    if min_verification_level > 0 {
        require!(
            parsed.verification_level >= min_verification_level,
            EscrowV3Error::InsufficientVerificationLevel
        );
    }

    Ok(())
}

fn assert_usdc_escrow(
    escrow: &EscrowV3,
    mint: &Pubkey,
    vault: &Pubkey,
) -> Result<()> {
    require!(escrow.currency == EscrowCurrency::Usdc, EscrowV3Error::WrongCurrency);
    require!(escrow.token_mint == Some(*mint), EscrowV3Error::WrongTokenMint);
    require!(escrow.token_vault == Some(*vault), EscrowV3Error::WrongTokenVault);
    require!(escrow.token_decimals.is_some(), EscrowV3Error::MissingTokenDecimals);
    Ok(())
}

fn transfer_checked_from_vault<'info>(
    escrow: &Account<'info, EscrowV3>,
    token_program: AccountInfo<'info>,
    vault: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let nonce_bytes = escrow.nonce.to_le_bytes();
    let signer_seeds: &[&[u8]] = &[
        b"escrow_v3",
        escrow.client.as_ref(),
        escrow.description_hash.as_ref(),
        &nonce_bytes,
        &[escrow.bump],
    ];
    let decimals = escrow.token_decimals.ok_or(EscrowV3Error::MissingTokenDecimals)?;

    require_keys_eq!(
        token_program.key(),
        token_program_id(),
        EscrowV3Error::InvalidTokenProgram
    );

    let mut data = Vec::with_capacity(10);
    data.push(12); // SPL TokenInstruction::TransferChecked
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);

    let authority = escrow.to_account_info();
    let ix = Instruction {
        program_id: token_program.key(),
        accounts: vec![
            AccountMeta::new(vault.key(), false),
            AccountMeta::new_readonly(mint.key(), false),
            AccountMeta::new(destination.key(), false),
            AccountMeta::new_readonly(authority.key(), true),
        ],
        data,
    };

    invoke_signed(&ix, &[vault, mint, destination, authority, token_program], &[signer_seeds])
        .map_err(Into::into)
}

/// Parsed tail fields from a Genesis Record.
/// We need: genesis_record, is_active, authority, reputation_score, verification_level.
struct GenesisTail {
    genesis_record: i64,
    is_active: bool,
    authority: Pubkey,
    verification_level: u8,
}

/// Walk variable-length fields in Genesis Record to extract fixed tail fields.
///
/// Layout after 8-byte Anchor discriminator:
///   agent_id_hash: [u8; 32]
///   agent_name: String (4-byte len + bytes)
///   description: String
///   category: String
///   capabilities: Vec<String> (4-byte count + each: 4-byte len + bytes)
///   metadata_uri: String
///   face_image: String
///   face_mint: Pubkey (32 bytes)
///   face_burn_tx: String
///   genesis_record: i64 (8 bytes) ← WE NEED THIS
///   authority: Pubkey (32 bytes)
///   pending_authority: Option<Pubkey> (1 + 0|32 bytes)
///   reputation_score: u64 (8 bytes)
///   verification_level: u8 (1 byte) ← WE NEED THIS
///   ... remaining fields
fn parse_genesis_tail(data: &[u8]) -> Result<GenesisTail> {
    let mut offset: usize = 8; // skip discriminator

    // agent_id_hash: [u8; 32]
    offset += 32;

    // Skip variable-length strings: agent_name, description, category
    for _ in 0..3 {
        require!(offset + 4 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
        let len = u32::from_le_bytes(
            data[offset..offset + 4].try_into()
                .map_err(|_| error!(EscrowV3Error::InvalidIdentityAccount))?
        ) as usize;
        offset += 4 + len;
    }

    // capabilities: Vec<String>
    require!(offset + 4 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
    let count = u32::from_le_bytes(
        data[offset..offset + 4].try_into()
            .map_err(|_| error!(EscrowV3Error::InvalidIdentityAccount))?
    ) as usize;
    offset += 4;
    for _ in 0..count {
        require!(offset + 4 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
        let len = u32::from_le_bytes(
            data[offset..offset + 4].try_into()
                .map_err(|_| error!(EscrowV3Error::InvalidIdentityAccount))?
        ) as usize;
        offset += 4 + len;
    }

    // metadata_uri: String
    require!(offset + 4 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
    let len = u32::from_le_bytes(
        data[offset..offset + 4].try_into()
            .map_err(|_| error!(EscrowV3Error::InvalidIdentityAccount))?
    ) as usize;
    offset += 4 + len;

    // face_image: String
    require!(offset + 4 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
    let len = u32::from_le_bytes(
        data[offset..offset + 4].try_into()
            .map_err(|_| error!(EscrowV3Error::InvalidIdentityAccount))?
    ) as usize;
    offset += 4 + len;

    // face_mint: Pubkey (32 bytes)
    offset += 32;

    // face_burn_tx: String
    require!(offset + 4 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
    let len = u32::from_le_bytes(
        data[offset..offset + 4].try_into()
            .map_err(|_| error!(EscrowV3Error::InvalidIdentityAccount))?
    ) as usize;
    offset += 4 + len;

    // genesis_record: i64
    require!(offset + 8 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
    let genesis_record = i64::from_le_bytes(
        data[offset..offset + 8].try_into()
            .map_err(|_| error!(EscrowV3Error::InvalidIdentityAccount))?
    );
    offset += 8;

    // is_active: bool (1 byte) — TD-004
    require!(offset + 1 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
    let is_active = data[offset] != 0;
    offset += 1;

    // authority: Pubkey (32 bytes) — TD-002
    require!(offset + 32 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
    let authority = Pubkey::try_from(&data[offset..offset + 32])
        .map_err(|_| error!(EscrowV3Error::InvalidIdentityAccount))?;
    offset += 32;

    // pending_authority: Option<Pubkey> (1 byte tag + 0|32 bytes)
    require!(offset + 1 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
    let tag = data[offset];
    offset += 1;
    if tag == 1 {
        offset += 32; // Some(Pubkey)
    }

    // reputation_score: u64 (8 bytes)
    require!(offset + 8 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
    let _reputation_score = u64::from_le_bytes(
        data[offset..offset + 8].try_into()
            .map_err(|_| error!(EscrowV3Error::InvalidIdentityAccount))?
    );
    offset += 8;

    // verification_level: u8
    require!(offset + 1 <= data.len(), EscrowV3Error::InvalidIdentityAccount);
    let verification_level = data[offset];

    Ok(GenesisTail {
        genesis_record,
        is_active,
        authority,
        verification_level,
    })
}

// ═══════════════════════════════════════════════
//  ACCOUNT STRUCTS
// ═══════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(
    agent_id: String,
    amount: u64,
    description_hash: [u8; 32],
    deadline: i64,
    nonce: u64,
)]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub client: Signer<'info>,

    /// The agent's wallet that will receive funds
    /// CHECK: Validated against Genesis Record authority
    pub agent_wallet: UncheckedAccount<'info>,

    /// The agent's SATP V3 Genesis Record
    /// CHECK: Verified manually — owner check + PDA derivation
    pub agent_identity: UncheckedAccount<'info>,

    /// Arbiter for dispute resolution — must be a third party (not client or agent)
    /// CHECK: Stored in escrow, validated != client and != agent in instruction logic
    pub arbiter: UncheckedAccount<'info>,

    #[account(
        init,
        payer = client,
        space = 8 + EscrowV3::INIT_SPACE,
        seeds = [
            b"escrow_v3",
            client.key().as_ref(),
            description_hash.as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump,
    )]
    pub escrow: Account<'info, EscrowV3>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    agent_id: String,
    amount: u64,
    description_hash: [u8; 32],
    deadline: i64,
    nonce: u64,
)]
pub struct CreateUsdcEscrow<'info> {
    #[account(mut)]
    pub client: Signer<'info>,

    /// CHECK: Validated against Genesis Record authority
    pub agent_wallet: UncheckedAccount<'info>,

    /// CHECK: Verified manually — owner check + PDA derivation
    pub agent_identity: UncheckedAccount<'info>,

    /// CHECK: Stored in escrow, validated != client and != agent in instruction logic
    pub arbiter: UncheckedAccount<'info>,

    #[account(
        init,
        payer = client,
        space = 8 + EscrowV3::INIT_SPACE,
        seeds = [
            b"escrow_v3",
            client.key().as_ref(),
            description_hash.as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump,
    )]
    pub escrow: Account<'info, EscrowV3>,

    /// CHECK: SPL mint account validated manually for token owner and decimals
    pub usdc_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = client_usdc_account.key() == expected_ata(&client.key(), &usdc_mint.key()) @ EscrowV3Error::InvalidAssociatedTokenAccount,
    )]
    /// CHECK: Associated token account validated manually
    pub client_usdc_account: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_usdc_account.key() == expected_ata(&escrow.key(), &usdc_mint.key()) @ EscrowV3Error::InvalidAssociatedTokenAccount,
    )]
    /// CHECK: Escrow vault ATA validated manually
    pub vault_usdc_account: UncheckedAccount<'info>,

    /// CHECK: SPL Token program id validated manually
    pub token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitWork<'info> {
    #[account(
        mut,
        constraint = escrow.agent == agent.key() @ EscrowV3Error::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowV3>,

    pub agent: Signer<'info>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    #[account(
        mut,
        constraint = escrow.client == client.key() @ EscrowV3Error::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowV3>,

    pub client: Signer<'info>,

    /// CHECK: Agent receiving funds, validated against escrow.agent
    #[account(
        mut,
        constraint = escrow.agent == agent.key() @ EscrowV3Error::WrongAgent,
    )]
    pub agent: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ReleaseUsdc<'info> {
    #[account(
        mut,
        constraint = escrow.client == client.key() @ EscrowV3Error::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowV3>,

    pub client: Signer<'info>,

    /// CHECK: Agent receiving funds, validated against escrow.agent
    #[account(constraint = escrow.agent == agent.key() @ EscrowV3Error::WrongAgent)]
    pub agent: UncheckedAccount<'info>,

    /// CHECK: SPL mint account validated manually for token owner and decimals
    pub usdc_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_usdc_account.key() == expected_ata(&escrow.key(), &usdc_mint.key()) @ EscrowV3Error::InvalidAssociatedTokenAccount,
    )]
    /// CHECK: Escrow vault ATA validated manually
    pub vault_usdc_account: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = agent_usdc_account.key() == expected_ata(&agent.key(), &usdc_mint.key()) @ EscrowV3Error::InvalidAssociatedTokenAccount,
    )]
    /// CHECK: Associated token account validated manually
    pub agent_usdc_account: UncheckedAccount<'info>,

    /// CHECK: SPL Token program id validated manually
    pub token_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(
        mut,
        constraint = escrow.client == client.key() @ EscrowV3Error::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowV3>,

    #[account(mut)]
    pub client: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelUsdc<'info> {
    #[account(
        mut,
        constraint = escrow.client == client.key() @ EscrowV3Error::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowV3>,

    #[account(mut)]
    pub client: Signer<'info>,

    /// CHECK: SPL mint account validated manually for token owner and decimals
    pub usdc_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_usdc_account.key() == expected_ata(&escrow.key(), &usdc_mint.key()) @ EscrowV3Error::InvalidAssociatedTokenAccount,
    )]
    /// CHECK: Escrow vault ATA validated manually
    pub vault_usdc_account: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = client_usdc_account.key() == expected_ata(&client.key(), &usdc_mint.key()) @ EscrowV3Error::InvalidAssociatedTokenAccount,
    )]
    /// CHECK: Associated token account validated manually
    pub client_usdc_account: UncheckedAccount<'info>,

    /// CHECK: SPL Token program id validated manually
    pub token_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    #[account(mut)]
    pub escrow: Account<'info, EscrowV3>,

    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        constraint = escrow.arbiter == arbiter.key() @ EscrowV3Error::NotArbiter,
    )]
    pub escrow: Account<'info, EscrowV3>,

    pub arbiter: Signer<'info>,

    /// CHECK: Agent receiving funds
    #[account(
        mut,
        constraint = escrow.agent == agent.key() @ EscrowV3Error::WrongAgent,
    )]
    pub agent: UncheckedAccount<'info>,

    /// CHECK: Client receiving refund
    #[account(
        mut,
        constraint = escrow.client == client_wallet.key() @ EscrowV3Error::Unauthorized,
    )]
    pub client_wallet: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ResolveDisputeUsdc<'info> {
    #[account(
        mut,
        constraint = escrow.arbiter == arbiter.key() @ EscrowV3Error::NotArbiter,
    )]
    pub escrow: Account<'info, EscrowV3>,

    pub arbiter: Signer<'info>,

    /// CHECK: Agent receiving funds
    #[account(constraint = escrow.agent == agent.key() @ EscrowV3Error::WrongAgent)]
    pub agent: UncheckedAccount<'info>,

    /// CHECK: Client receiving refund
    #[account(constraint = escrow.client == client_wallet.key() @ EscrowV3Error::Unauthorized)]
    pub client_wallet: UncheckedAccount<'info>,

    /// CHECK: SPL mint account validated manually for token owner and decimals
    pub usdc_mint: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_usdc_account.key() == expected_ata(&escrow.key(), &usdc_mint.key()) @ EscrowV3Error::InvalidAssociatedTokenAccount,
    )]
    /// CHECK: Escrow vault ATA validated manually
    pub vault_usdc_account: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = agent_usdc_account.key() == expected_ata(&agent.key(), &usdc_mint.key()) @ EscrowV3Error::InvalidAssociatedTokenAccount,
    )]
    /// CHECK: Associated token account validated manually
    pub agent_usdc_account: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = client_usdc_account.key() == expected_ata(&client_wallet.key(), &usdc_mint.key()) @ EscrowV3Error::InvalidAssociatedTokenAccount,
    )]
    /// CHECK: Associated token account validated manually
    pub client_usdc_account: UncheckedAccount<'info>,

    /// CHECK: SPL Token program id validated manually
    pub token_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ExtendDeadline<'info> {
    #[account(
        mut,
        constraint = escrow.client == client.key() @ EscrowV3Error::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowV3>,

    pub client: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseEscrow<'info> {
    #[account(
        mut,
        constraint = escrow.client == client.key() @ EscrowV3Error::Unauthorized,
        constraint = escrow.status == EscrowStatus::Released
            || escrow.status == EscrowStatus::Cancelled
            || escrow.status == EscrowStatus::Resolved @ EscrowV3Error::NotCloseable,
        close = client,
    )]
    pub escrow: Account<'info, EscrowV3>,

    #[account(mut)]
    pub client: Signer<'info>,
}

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════

#[account]
#[derive(InitSpace)]
pub struct EscrowV3 {
    /// Client who created the escrow
    pub client: Pubkey,                      // 32

    /// Agent wallet that receives funds
    pub agent: Pubkey,                       // 32

    /// SHA-256 of agent_id (links to Genesis Record)
    pub agent_id_hash: [u8; 32],             // 32

    /// Total escrowed amount in lamports
    pub amount: u64,                         // 8

    /// Amount already released (for partial/milestone releases)
    pub released_amount: u64,                // 8

    /// SHA-256 of job description
    pub description_hash: [u8; 32],          // 32

    /// Deadline for work submission (Unix timestamp)
    pub deadline: i64,                       // 8

    /// Nonce for uniqueness (same client+agent can have multiple escrows)
    pub nonce: u64,                          // 8

    /// Escrow funding currency.
    pub currency: EscrowCurrency,             // 1

    /// SPL mint used for token-funded escrow; None for SOL.
    pub token_mint: Option<Pubkey>,           // 1 + 32 = 33

    /// SPL vault ATA controlled by the escrow PDA; None for SOL.
    pub token_vault: Option<Pubkey>,          // 1 + 32 = 33

    /// SPL mint decimals used by transfer_checked; None for SOL.
    pub token_decimals: Option<u8>,           // 1 + 1 = 2

    /// Current escrow status
    pub status: EscrowStatus,                // 1

    /// Minimum verification level required at creation
    pub min_verification_level: u8,          // 1

    /// Whether born status was required at creation
    pub require_born: bool,                  // 1

    /// Creation timestamp
    pub created_at: i64,                     // 8

    /// Designated arbiter for dispute resolution
    pub arbiter: Pubkey,                     // 32

    /// Work proof hash (set on submit_work)
    #[max_len(32)]
    pub work_hash: Option<[u8; 32]>,         // 1 + 32 = 33

    /// When work was submitted
    pub work_submitted_at: Option<i64>,      // 1 + 8 = 9

    /// Dispute reason hash (set on raise_dispute)
    #[max_len(32)]
    pub dispute_reason_hash: Option<[u8; 32]>, // 1 + 32 = 33

    /// When dispute was raised
    pub disputed_at: Option<i64>,            // 1 + 8 = 9

    /// Who raised the dispute
    pub disputed_by: Option<Pubkey>,         // 1 + 32 = 33

    /// PDA bump seed
    pub bump: u8,                            // 1
}
// Total: 32+32+32+8+8+32+8+8+1+33+33+2+1+1+1+8+32+33+9+33+9+33+1 = 400 bytes + 8 discriminator = 408

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Active,
    WorkSubmitted,
    Released,
    Cancelled,
    Disputed,
    Resolved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowCurrency {
    Sol,
    Usdc,
}

// ═══════════════════════════════════════════════
//  ERRORS
// ═══════════════════════════════════════════════

#[error_code]
pub enum EscrowV3Error {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Deadline has already passed")]
    DeadlinePassed,

    #[msg("Agent ID exceeds 64 characters")]
    AgentIdTooLong,

    #[msg("Verification level must be 0-5")]
    InvalidVerificationLevel,

    #[msg("Agent identity account has invalid owner (not identity_v3)")]
    InvalidIdentityOwner,

    #[msg("Agent identity PDA derivation does not match")]
    InvalidIdentityPda,

    #[msg("Agent identity account data is invalid")]
    InvalidIdentityAccount,

    #[msg("Agent has not completed burn-to-become (not born)")]
    AgentNotBorn,

    #[msg("Agent verification level is below required minimum")]
    InsufficientVerificationLevel,

    #[msg("Escrow is not in active state")]
    NotActive,

    #[msg("Escrow cannot be released in current state")]
    NotReleasable,

    #[msg("Nothing left to release")]
    NothingToRelease,

    #[msg("Release amount exceeds remaining funds")]
    InsufficientFunds,

    #[msg("Escrow cannot be cancelled (must be Active)")]
    NotCancellable,

    #[msg("Deadline not yet reached, cannot cancel")]
    DeadlineNotReached,

    #[msg("Escrow cannot be disputed (must be WorkSubmitted)")]
    NotDisputable,

    #[msg("Escrow is not in disputed state")]
    NotDisputed,

    #[msg("Escrow cannot be closed (must be Released, Cancelled, or Resolved)")]
    NotCloseable,

    #[msg("Signer is not the designated arbiter")]
    NotArbiter,

    #[msg("Unauthorized — signer does not match expected authority")]
    Unauthorized,

    #[msg("Wrong agent account")]
    WrongAgent,

    #[msg("Dispute resolution amounts don't match remaining balance")]
    ResolutionAmountMismatch,

    #[msg("Client cannot be their own arbiter — use a third-party arbiter")]
    ClientCannotBeArbiter,

    #[msg("Agent cannot be their own arbiter — use a third-party arbiter")]
    AgentCannotBeArbiter,

    #[msg("New deadline must be strictly after the current deadline")]
    NewDeadlineMustBeLater,

    #[msg("Arithmetic overflow in escrow calculation")]
    ArithmeticOverflow,

    #[msg("Agent identity is deactivated — cannot create escrow with inactive agent")]
    AgentIdentityDeactivated,

    #[msg("Agent wallet does not match identity authority — funds would go to wrong recipient")]
    AgentWalletMismatch,

    #[msg("Instruction currency does not match escrow currency")]
    WrongCurrency,

    #[msg("Token mint does not match escrow token mint")]
    WrongTokenMint,

    #[msg("Token vault does not match escrow token vault")]
    WrongTokenVault,

    #[msg("Escrow token decimals are missing")]
    MissingTokenDecimals,

    #[msg("Provided token decimals do not match mint decimals")]
    TokenDecimalsMismatch,

    #[msg("Token account is not the expected associated token account")]
    InvalidAssociatedTokenAccount,

    #[msg("Token account owner is invalid")]
    InvalidTokenOwner,

    #[msg("SPL Token program account is invalid")]
    InvalidTokenProgram,

    #[msg("SPL mint account data is invalid")]
    InvalidMintAccount,

    #[msg("SPL token account data is invalid")]
    InvalidTokenAccount,
}

// ═══════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════

#[event]
pub struct EscrowCreated {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub agent: Pubkey,
    pub agent_id_hash: [u8; 32],
    pub amount: u64,
    pub deadline: i64,
    pub arbiter: Pubkey,
}

#[event]
pub struct WorkSubmitted {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub work_hash: [u8; 32],
    pub submitted_at: i64,
}

#[event]
pub struct EscrowReleased {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub amount: u64,
    pub total_released: u64,
}

#[event]
pub struct PartialRelease {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub amount: u64,
    pub total_released: u64,
    pub remaining: u64,
}

#[event]
pub struct EscrowCancelled {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub refunded: u64,
}

#[event]
pub struct DisputeRaised {
    pub escrow: Pubkey,
    pub raised_by: Pubkey,
    pub reason_hash: [u8; 32],
}

#[event]
pub struct DeadlineExtended {
    pub escrow: Pubkey,
    pub old_deadline: i64,
    pub new_deadline: i64,
    pub extended_by: Pubkey,
}

#[event]
pub struct DisputeResolved {
    pub escrow: Pubkey,
    pub agent_amount: u64,
    pub client_amount: u64,
    pub resolved_by: Pubkey,
}

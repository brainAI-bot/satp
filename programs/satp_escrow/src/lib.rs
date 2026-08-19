use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};

// LEGACY V2 only. Not SATP V3 escrow.
// V3 escrow is programs/escrow_v3 (HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C mainnet / B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg devnet).
// This declare_id is the historical V2 program UpJ7jmUzHkQ7EdBKiBv3zq8Dr1fVh6GVWKa7nYtwQ22. Do not retarget to V3.
declare_id!("UpJ7jmUzHkQ7EdBKiBv3zq8Dr1fVh6GVWKa7nYtwQ22");

#[program]
pub mod satp_escrow {
    use super::*;

    /// Client creates an escrow, depositing SOL for an agent to complete work
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        agent: Pubkey,
        amount: u64,
        description_hash: [u8; 32],
        deadline: i64,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);

        let now = Clock::get()?.unix_timestamp;
        require!(deadline > now, EscrowError::DeadlinePassed);

        let escrow = &mut ctx.accounts.escrow;
        escrow.client = ctx.accounts.client.key();
        escrow.agent = agent;
        escrow.amount = amount;
        escrow.description_hash = description_hash;
        escrow.deadline = deadline;
        escrow.status = EscrowStatus::Active;
        escrow.created_at = now;
        escrow.bump = ctx.bumps.escrow;
        escrow.work_hash = None;

        invoke(
            &system_instruction::transfer(&ctx.accounts.client.key(), &escrow.key(), amount),
            &[
                ctx.accounts.client.to_account_info(),
                escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        emit!(EscrowCreated {
            escrow: escrow.key(),
            client: escrow.client,
            agent,
            amount,
        });

        Ok(())
    }

    /// Agent marks work as submitted (for dispute resolution / audit trail)
    pub fn submit_work(ctx: Context<SubmitWork>, work_hash: [u8; 32]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Active, EscrowError::NotActive);
        require_keys_eq!(escrow.agent, ctx.accounts.agent.key(), EscrowError::WrongAgent);

        escrow.status = EscrowStatus::WorkSubmitted;
        escrow.work_hash = Some(work_hash);

        emit!(WorkSubmitted {
            escrow: escrow.key(),
            agent: escrow.agent,
            work_hash,
        });

        Ok(())
    }

    /// Client releases funds to agent (work completed satisfactorily)
    /// Allowed when status is Active or WorkSubmitted
    pub fn release(ctx: Context<Release>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Active || escrow.status == EscrowStatus::WorkSubmitted,
            EscrowError::NotReleasable
        );
        require_keys_eq!(escrow.agent, ctx.accounts.agent.key(), EscrowError::WrongAgent);

        transfer_from_escrow(
            escrow.to_account_info(),
            ctx.accounts.agent.to_account_info(),
            escrow.amount,
        )?;
        escrow.status = EscrowStatus::Released;

        emit!(EscrowReleased {
            escrow: escrow.key(),
            agent: escrow.agent,
            amount: escrow.amount,
        });

        Ok(())
    }

    /// Client cancels escrow and gets refund
    /// Only allowed if deadline has passed AND status is Active (agent never submitted work)
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Active, EscrowError::NotCancellable);

        let now = Clock::get()?.unix_timestamp;
        require!(now >= escrow.deadline, EscrowError::DeadlineNotReached);

        transfer_from_escrow(
            escrow.to_account_info(),
            ctx.accounts.client.to_account_info(),
            escrow.amount,
        )?;
        escrow.status = EscrowStatus::Cancelled;

        emit!(EscrowCancelled {
            escrow: escrow.key(),
            client: escrow.client,
            amount: escrow.amount,
        });

        Ok(())
    }

    /// Either party raises a dispute (only when work has been submitted)
    /// Disputes require off-chain resolution -- this just freezes the escrow
    pub fn raise_dispute(ctx: Context<RaiseDispute>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::WorkSubmitted, EscrowError::NotDisputable);

        let signer = ctx.accounts.signer.key();
        require!(
            signer == escrow.client || signer == escrow.agent,
            EscrowError::Unauthorized
        );

        escrow.status = EscrowStatus::Disputed;

        emit!(DisputeRaised {
            escrow: escrow.key(),
            raised_by: signer,
        });

        Ok(())
    }

    /// Close a settled escrow (Released or Cancelled)
    /// Returns rent to client. Can only be called by client.
    pub fn close_escrow(ctx: Context<CloseEscrow>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Released || escrow.status == EscrowStatus::Cancelled,
            EscrowError::NotCloseable
        );

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(agent: Pubkey, amount: u64, description_hash: [u8; 32], deadline: i64)]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(
        init,
        payer = client,
        space = Escrow::SPACE,
        seeds = [b"escrow", client.key().as_ref(), description_hash.as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitWork<'info> {
    #[account(mut, has_one = agent @ EscrowError::WrongAgent)]
    pub escrow: Account<'info, Escrow>,
    pub agent: Signer<'info>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut, has_one = client @ EscrowError::Unauthorized)]
    pub escrow: Account<'info, Escrow>,
    pub client: Signer<'info>,
    /// CHECK: Agent is checked against escrow.agent and only receives lamports.
    #[account(mut)]
    pub agent: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut, has_one = client @ EscrowError::Unauthorized)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub client: Signer<'info>,
}

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseEscrow<'info> {
    #[account(
        mut,
        has_one = client @ EscrowError::Unauthorized,
        close = client
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub client: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub client: Pubkey,
    pub agent: Pubkey,
    pub amount: u64,
    pub description_hash: [u8; 32],
    pub deadline: i64,
    pub status: EscrowStatus,
    pub created_at: i64,
    pub bump: u8,
    pub work_hash: Option<[u8; 32]>,
}

impl Escrow {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Active,
    Released,
    Cancelled,
    WorkSubmitted,
    Disputed,
}

#[event]
pub struct EscrowCreated {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub agent: Pubkey,
    pub amount: u64,
}

#[event]
pub struct WorkSubmitted {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub work_hash: [u8; 32],
}

#[event]
pub struct EscrowReleased {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowCancelled {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DisputeRaised {
    pub escrow: Pubkey,
    pub raised_by: Pubkey,
}

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Deadline has already passed")]
    DeadlinePassed,
    #[msg("Escrow is not in active state")]
    NotActive,
    #[msg("Escrow cannot be released in current state (must be Active or WorkSubmitted)")]
    NotReleasable,
    #[msg("Escrow cannot be cancelled in current state (must be Active)")]
    NotCancellable,
    #[msg("Escrow cannot be disputed in current state (must be WorkSubmitted)")]
    NotDisputable,
    #[msg("Escrow cannot be closed (must be Released or Cancelled)")]
    NotCloseable,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Wrong agent account")]
    WrongAgent,
    #[msg("Deadline not yet reached, cannot cancel")]
    DeadlineNotReached,
}

fn transfer_from_escrow<'info>(
    escrow: AccountInfo<'info>,
    recipient: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let escrow_balance = escrow.lamports();
    require!(escrow_balance >= amount, EscrowError::NotReleasable);

    **escrow.try_borrow_mut_lamports()? = escrow_balance
        .checked_sub(amount)
        .ok_or(EscrowError::NotReleasable)?;
    **recipient.try_borrow_mut_lamports()? = recipient
        .lamports()
        .checked_add(amount)
        .ok_or(EscrowError::NotReleasable)?;

    Ok(())
}

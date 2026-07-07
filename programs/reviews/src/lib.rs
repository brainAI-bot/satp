use anchor_lang::prelude::*;

declare_id!("D8HsSpK3JtAN7tVcA1yfgxScju7KcG6skEfaShSKojki");

#[program]
pub mod reviews {
    use super::*;

    pub fn init_review_counter(ctx: Context<InitReviewCounter>, agent_id: Pubkey) -> Result<()> {
        let review_counter = &mut ctx.accounts.review_counter;
        review_counter.agent_id = agent_id;
        review_counter.count = 0;
        review_counter.bump = ctx.bumps.review_counter;
        Ok(())
    }

    pub fn create_review(
        ctx: Context<CreateReview>,
        agent_id: Pubkey,
        rating: u8,
        review_text: String,
        metadata: String,
    ) -> Result<()> {
        require!(
            (MIN_RATING..=MAX_RATING).contains(&rating),
            ReviewError::InvalidRating
        );
        validate_string(&review_text, MAX_REVIEW_TEXT_LEN, ReviewError::ReviewTextTooLong)?;
        validate_string(&metadata, MAX_METADATA_LEN, ReviewError::MetadataTooLong)?;

        let now = Clock::get()?.unix_timestamp;
        let review = &mut ctx.accounts.review;
        review.agent_id = agent_id;
        review.reviewer = ctx.accounts.reviewer.key();
        review.rating = rating;
        review.review_text = review_text;
        review.metadata = metadata;
        review.created_at = now;
        review.updated_at = now;
        review.is_active = true;
        review.bump = ctx.bumps.review;

        let review_counter = &mut ctx.accounts.review_counter;
        review_counter.count = review_counter
            .count
            .checked_add(1)
            .ok_or(ReviewError::InvalidRating)?;

        emit!(ReviewCreated {
            agent_id,
            reviewer: review.reviewer,
            rating,
            timestamp: now,
        });

        Ok(())
    }

    pub fn update_review(
        ctx: Context<ManageReview>,
        rating: Option<u8>,
        review_text: Option<String>,
        metadata: Option<String>,
    ) -> Result<()> {
        let review = &mut ctx.accounts.review;
        require!(review.is_active, ReviewError::SelfReview);

        if let Some(value) = rating {
            require!(
                (MIN_RATING..=MAX_RATING).contains(&value),
                ReviewError::InvalidRating
            );
            review.rating = value;
        }
        if let Some(value) = review_text {
            validate_string(&value, MAX_REVIEW_TEXT_LEN, ReviewError::ReviewTextTooLong)?;
            review.review_text = value;
        }
        if let Some(value) = metadata {
            validate_string(&value, MAX_METADATA_LEN, ReviewError::MetadataTooLong)?;
            review.metadata = value;
        }

        let now = Clock::get()?.unix_timestamp;
        review.updated_at = now;

        emit!(ReviewUpdated {
            agent_id: review.agent_id,
            reviewer: review.reviewer,
            timestamp: now,
        });

        Ok(())
    }

    pub fn delete_review(ctx: Context<ManageReview>) -> Result<()> {
        let review = &mut ctx.accounts.review;
        require!(review.is_active, ReviewError::SelfReview);
        review.is_active = false;
        review.updated_at = Clock::get()?.unix_timestamp;

        emit!(ReviewDeleted {
            agent_id: review.agent_id,
            reviewer: review.reviewer,
            timestamp: review.updated_at,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(agent_id: Pubkey)]
pub struct InitReviewCounter<'info> {
    #[account(
        init,
        payer = payer,
        space = ReviewCounter::SPACE,
        seeds = [b"review_counter", agent_id.as_ref()],
        bump
    )]
    pub review_counter: Account<'info, ReviewCounter>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(agent_id: Pubkey)]
pub struct CreateReview<'info> {
    #[account(
        init,
        payer = reviewer,
        space = Review::SPACE,
        seeds = [b"review", agent_id.as_ref(), reviewer.key().as_ref()],
        bump
    )]
    pub review: Account<'info, Review>,
    #[account(
        mut,
        seeds = [b"review_counter", agent_id.as_ref()],
        bump = review_counter.bump,
        constraint = review_counter.agent_id == agent_id @ ReviewError::SelfReview
    )]
    pub review_counter: Account<'info, ReviewCounter>,
    #[account(mut)]
    pub reviewer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageReview<'info> {
    #[account(mut, has_one = reviewer @ ReviewError::SelfReview)]
    pub review: Account<'info, Review>,
    pub reviewer: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Review {
    pub agent_id: Pubkey,
    pub reviewer: Pubkey,
    pub rating: u8,
    #[max_len(1024)]
    pub review_text: String,
    #[max_len(512)]
    pub metadata: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

impl Review {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct ReviewCounter {
    pub agent_id: Pubkey,
    pub count: u64,
    pub bump: u8,
}

impl ReviewCounter {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[event]
pub struct ReviewCreated {
    pub agent_id: Pubkey,
    pub reviewer: Pubkey,
    pub rating: u8,
    pub timestamp: i64,
}

#[event]
pub struct ReviewUpdated {
    pub agent_id: Pubkey,
    pub reviewer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ReviewDeleted {
    pub agent_id: Pubkey,
    pub reviewer: Pubkey,
    pub timestamp: i64,
}

#[error_code]
pub enum ReviewError {
    #[msg("Review rating must be between 1 and 5")]
    InvalidRating,
    #[msg("Review text exceeds max length")]
    ReviewTextTooLong,
    #[msg("Review metadata exceeds max length")]
    MetadataTooLong,
    #[msg("Reviewer cannot review itself or manage another reviewer account")]
    SelfReview,
}

const MIN_RATING: u8 = 1;
const MAX_RATING: u8 = 5;
const MAX_REVIEW_TEXT_LEN: usize = 1024;
const MAX_METADATA_LEN: usize = 512;

fn validate_string(value: &str, max_len: usize, error: ReviewError) -> Result<()> {
    if value.len() > max_len {
        return Err(error.into());
    }
    Ok(())
}

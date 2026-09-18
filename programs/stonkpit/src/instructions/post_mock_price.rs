use anchor_lang::prelude::*;

use crate::error::StonkPitError;
use crate::state::{Config, MockPrice};

#[derive(Accounts)]
#[instruction(stock_mint: Pubkey)]
pub struct PostMockPrice<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin @ StonkPitError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + MockPrice::INIT_SPACE,
        seeds = [b"mock_price", stock_mint.as_ref()],
        bump,
    )]
    pub mock_price: Account<'info, MockPrice>,

    pub system_program: Program<'info, System>,
}

pub fn handle_post_mock_price(
    ctx: Context<PostMockPrice>,
    stock_mint: Pubkey,
    price: i64,
) -> Result<()> {
    require!(
        ctx.accounts.config.allowed_mints.contains(&stock_mint),
        StonkPitError::UnknownMint
    );
    require!(price > 0, StonkPitError::StalePrice);

    let now = Clock::get()?.unix_timestamp;
    let mock = &mut ctx.accounts.mock_price;
    mock.stock_mint = stock_mint;
    mock.price = price;
    mock.updated_ts = now;
    mock.bump = ctx.bumps.mock_price;

    Ok(())
}

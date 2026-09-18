use anchor_lang::prelude::*;

use crate::error::StonkPitError;
use crate::state::Config;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin @ StonkPitError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn handle_pause(ctx: Context<Pause>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    Ok(())
}

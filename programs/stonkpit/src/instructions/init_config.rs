use anchor_lang::prelude::*;

use crate::constants::DEFAULT_FEE_BPS;
use crate::error::StonkPitError;
use crate::state::Config;

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_config(
    ctx: Context<InitConfig>,
    treasury: Pubkey,
    usdc_mint: Pubkey,
    fee_bps: u16,
    min_players: u8,
    max_players: u8,
    allowed_mints: Vec<Pubkey>,
) -> Result<()> {
    require!(usdc_mint != Pubkey::default(), StonkPitError::WrongUsdcMint);
    require!(fee_bps <= 10_000, StonkPitError::Unauthorized);
    require!(min_players >= 2, StonkPitError::NotEnoughPlayers);
    require!(max_players <= 8, StonkPitError::RoomFull);
    require!(min_players <= max_players, StonkPitError::NotEnoughPlayers);
    require!(!allowed_mints.is_empty(), StonkPitError::UnknownMint);

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.treasury = treasury;
    config.fee_bps = if fee_bps == 0 {
        DEFAULT_FEE_BPS
    } else {
        fee_bps
    };
    config.min_players = min_players;
    config.max_players = max_players;
    config.allowed_mints = allowed_mints;
    config.usdc_mint = usdc_mint;
    config.paused = false;
    config.next_room_id = 1;
    config.bump = ctx.bumps.config;

    Ok(())
}

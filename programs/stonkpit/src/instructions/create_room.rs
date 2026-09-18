use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::error::StonkPitError;
use crate::state::{Config, Room, RoomStatus};

#[derive(Accounts)]
pub struct CreateRoom<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin @ StonkPitError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = 8 + Room::INIT_SPACE,
        seeds = [b"room", config.next_room_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub room: Account<'info, Room>,

    #[account(
        constraint = usdc_mint.key() == config.usdc_mint @ StonkPitError::WrongUsdcMint,
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = room,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_room(ctx: Context<CreateRoom>, stake_amount: u64, duration_secs: i64) -> Result<()> {
    require!(!ctx.accounts.config.paused, StonkPitError::Paused);
    require!(stake_amount > 0, StonkPitError::Unauthorized);
    require!(duration_secs > 0, StonkPitError::Unauthorized);

    let room_id = ctx.accounts.config.next_room_id;
    let now = Clock::get()?.unix_timestamp;

    let room = &mut ctx.accounts.room;
    room.room_id = room_id;
    room.status = RoomStatus::Open;
    room.stake_amount = stake_amount;
    room.duration_secs = duration_secs;
    room.created_ts = now;
    room.lock_ts = 0;
    room.end_ts = 0;
    room.player_count = 0;
    room.pot = 0;
    room.is_split = false;
    room.winner_count = 0;
    room.fee_collected = false;
    room.winners = [Pubkey::default(); 8];
    room.seats = [Pubkey::default(); 8];
    room.bump = ctx.bumps.room;

    ctx.accounts.config.next_room_id = room_id
        .checked_add(1)
        .ok_or(StonkPitError::Unauthorized)?;

    Ok(())
}

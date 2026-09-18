use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::StonkPitError;
use crate::state::{Config, Room, RoomStatus, Seat};

#[derive(Accounts)]
#[instruction(stock_mint: Pubkey)]
pub struct JoinRoom<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        constraint = room.status == RoomStatus::Open @ StonkPitError::RoomNotOpen,
    )]
    pub room: Account<'info, Room>,

    #[account(
        init,
        payer = player,
        space = 8 + Seat::INIT_SPACE,
        seeds = [b"seat", room.key().as_ref(), player.key().as_ref()],
        bump,
    )]
    pub seat: Account<'info, Seat>,

    #[account(
        mut,
        constraint = player_usdc.mint == config.usdc_mint @ StonkPitError::WrongUsdcMint,
        constraint = player_usdc.owner == player.key() @ StonkPitError::Unauthorized,
    )]
    pub player_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault.mint == config.usdc_mint @ StonkPitError::WrongVaultMint,
        constraint = vault.owner == room.key() @ StonkPitError::WrongVaultMint,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_join_room(ctx: Context<JoinRoom>, stock_mint: Pubkey) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, StonkPitError::Paused);

    let room = &mut ctx.accounts.room;
    require!(
        room.player_count < config.max_players,
        StonkPitError::RoomFull
    );

    require!(
        config.allowed_mints.contains(&stock_mint),
        StonkPitError::UnknownMint
    );

    let stake = room.stake_amount;
    let seat = &mut ctx.accounts.seat;
    seat.room = room.key();
    seat.player = ctx.accounts.player.key();
    seat.stock_mint = stock_mint;
    seat.deposited = stake;
    seat.start_price = 0;
    seat.end_price = 0;
    seat.score_bps = 0;
    seat.claimed = false;
    seat.bump = ctx.bumps.seat;

    let cpi_accounts = Transfer {
        from: ctx.accounts.player_usdc.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.player.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
        stake,
    )?;

    let idx = room.player_count as usize;
    room.seats[idx] = seat.key();
    room.player_count = room
        .player_count
        .checked_add(1)
        .ok_or(StonkPitError::RoomFull)?;
    room.pot = room
        .pot
        .checked_add(stake)
        .ok_or(StonkPitError::Unauthorized)?;

    Ok(())
}

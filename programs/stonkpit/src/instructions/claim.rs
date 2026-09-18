use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::StonkPitError;
use crate::state::{Config, Room, RoomStatus, Seat};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        constraint = room.status == RoomStatus::Settled @ StonkPitError::RoomClosed,
    )]
    pub room: Account<'info, Room>,

    #[account(
        mut,
        seeds = [b"seat", room.key().as_ref(), winner.key().as_ref()],
        bump = seat.bump,
        constraint = seat.player == winner.key() @ StonkPitError::Unauthorized,
    )]
    pub seat: Account<'info, Seat>,

    #[account(
        mut,
        constraint = vault.mint == config.usdc_mint @ StonkPitError::WrongVaultMint,
        constraint = vault.owner == room.key() @ StonkPitError::WrongVaultMint,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = winner_usdc.mint == config.usdc_mint @ StonkPitError::WrongUsdcMint,
        constraint = winner_usdc.owner == winner.key() @ StonkPitError::Unauthorized,
    )]
    pub winner_usdc: Account<'info, TokenAccount>,

    /// CHECK: treasury pubkey validated against config
    #[account(
        constraint = treasury.key() == config.treasury @ StonkPitError::Unauthorized,
    )]
    pub treasury: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = treasury_usdc.mint == config.usdc_mint @ StonkPitError::WrongUsdcMint,
        constraint = treasury_usdc.owner == treasury.key() @ StonkPitError::Unauthorized,
    )]
    pub treasury_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handle_claim(ctx: Context<Claim>) -> Result<()> {
    let room = &mut ctx.accounts.room;
    let seat = &mut ctx.accounts.seat;
    require!(!seat.claimed, StonkPitError::AlreadyClaimed);

    let mut is_winner = false;
    for i in 0..room.winner_count as usize {
        if room.winners[i] == ctx.accounts.winner.key() {
            is_winner = true;
            break;
        }
    }
    require!(is_winner, StonkPitError::NotWinner);

    let fee = (room.pot as u128)
        .saturating_mul(ctx.accounts.config.fee_bps as u128)
        .checked_div(10_000)
        .unwrap_or(0) as u64;
    let distributable = room.pot.saturating_sub(fee);
    let share = distributable
        .checked_div(room.winner_count as u64)
        .ok_or(StonkPitError::Unauthorized)?;

    let seeds = &[b"room", &room.room_id.to_le_bytes()[..], &[room.bump]];
    let signer = &[&seeds[..]];

    if !room.fee_collected && fee > 0 {
        let cpi = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.treasury_usdc.to_account_info(),
            authority: room.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                cpi,
                signer,
            ),
            fee,
        )?;
        room.fee_collected = true;
    }

    if share > 0 {
        let cpi = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.winner_usdc.to_account_info(),
            authority: room.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                cpi,
                signer,
            ),
            share,
        )?;
    }

    seat.claimed = true;
    Ok(())
}

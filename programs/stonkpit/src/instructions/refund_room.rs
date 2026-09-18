use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::StonkPitError;
use crate::state::{Config, Room, RoomStatus, Seat};

#[derive(Accounts)]
pub struct RefundRoom<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        constraint = room.status == RoomStatus::Open @ StonkPitError::RefundNotAllowed,
    )]
    pub room: Account<'info, Room>,

    #[account(
        mut,
        constraint = vault.mint == config.usdc_mint @ StonkPitError::WrongVaultMint,
        constraint = vault.owner == room.key() @ StonkPitError::WrongVaultMint,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_refund_room<'info>(ctx: Context<'info, RefundRoom<'info>>) -> Result<()> {
    let room = &mut ctx.accounts.room;
    let count = room.player_count as usize;

    require!(
        count > 0 && count < ctx.accounts.config.min_players as usize,
        StonkPitError::RefundNotAllowed
    );

    let remaining = ctx.remaining_accounts;
    require!(remaining.len() == count * 2, StonkPitError::InvalidSeat);

    let seeds = &[b"room", &room.room_id.to_le_bytes()[..], &[room.bump]];
    let signer = &[&seeds[..]];

    for i in 0..count {
        let seat_info = &remaining[i * 2];
        let player_usdc_info = &remaining[i * 2 + 1];

        require!(seat_info.key() == room.seats[i], StonkPitError::InvalidSeat);

        let seat_data = seat_info.try_borrow_data()?;
        let seat: Seat = Seat::try_deserialize(&mut &seat_data[..])?;
        require!(seat.room == room.key(), StonkPitError::InvalidSeat);
        require!(!seat.claimed, StonkPitError::AlreadyClaimed);
        drop(seat_data);

        let mut seat_data = seat_info.try_borrow_mut_data()?;
        let mut seat: Seat = Seat::try_deserialize(&mut &seat_data[..])?;

        let player_usdc: Account<TokenAccount> = Account::try_from(player_usdc_info)?;
        require!(
            player_usdc.owner == seat.player,
            StonkPitError::Unauthorized
        );
        require!(
            player_usdc.mint == ctx.accounts.config.usdc_mint,
            StonkPitError::WrongUsdcMint
        );

        let amount = seat.deposited;
        if amount > 0 {
            let cpi = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: player_usdc_info.clone(),
                authority: room.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    cpi,
                    signer,
                ),
                amount,
            )?;
        }

        seat.claimed = true;
        seat.try_serialize(&mut &mut seat_data[..])?;
    }

    room.status = RoomStatus::Refunded;
    room.pot = 0;
    Ok(())
}

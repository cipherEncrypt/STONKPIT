use anchor_lang::prelude::*;

use crate::error::StonkPitError;
use crate::pyth_util::read_stock_price;
use crate::state::{Config, Room, RoomStatus, Seat};

#[derive(Accounts)]
pub struct LockRoom<'info> {
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
}

pub fn handle_lock_room(ctx: Context<LockRoom>) -> Result<()> {
    require!(!ctx.accounts.config.paused, StonkPitError::Paused);

    let room = &mut ctx.accounts.room;
    let count = room.player_count as usize;
    require!(
        count >= ctx.accounts.config.min_players as usize,
        StonkPitError::NotEnoughPlayers
    );

    let remaining = ctx.remaining_accounts;
    require!(
        remaining.len() == count * 2,
        StonkPitError::InvalidPriceAccounts
    );

    let now = Clock::get()?.unix_timestamp;

    for i in 0..count {
        let seat_info = &remaining[i];
        let price_info = &remaining[i + count];

        require!(seat_info.key() == room.seats[i], StonkPitError::InvalidSeat);

        let mut seat_data = seat_info.try_borrow_mut_data()?;
        let mut seat: Seat = Seat::try_deserialize(&mut &seat_data[..])?;
        require!(seat.room == room.key(), StonkPitError::InvalidSeat);

        seat.start_price = read_stock_price(price_info, &seat.stock_mint, now)?;
        seat.try_serialize(&mut &mut seat_data[..])?;
    }

    room.status = RoomStatus::Locked;
    room.lock_ts = now;
    room.end_ts = now
        .checked_add(room.duration_secs)
        .ok_or(StonkPitError::Unauthorized)?;

    Ok(())
}

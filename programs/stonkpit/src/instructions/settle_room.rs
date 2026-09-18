use anchor_lang::prelude::*;

use crate::error::StonkPitError;
use crate::pyth_util::{read_stock_price, score_bps};
use crate::state::{Config, Room, RoomStatus, Seat};

#[derive(Accounts)]
pub struct SettleRoom<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        constraint = room.status == RoomStatus::Locked @ StonkPitError::RoomNotLocked,
    )]
    pub room: Account<'info, Room>,
}

pub fn handle_settle_room(ctx: Context<SettleRoom>) -> Result<()> {
    let room = &mut ctx.accounts.room;
    let now = Clock::get()?.unix_timestamp;
    require!(now >= room.end_ts, StonkPitError::TooEarlyToSettle);

    let count = room.player_count as usize;
    let remaining = ctx.remaining_accounts;
    require!(
        remaining.len() == count * 2,
        StonkPitError::InvalidPriceAccounts
    );

    let mut best_score = i64::MIN;
    let mut winners: Vec<Pubkey> = Vec::with_capacity(count);

    for i in 0..count {
        let seat_info = &remaining[i];
        let price_info = &remaining[i + count];

        require!(seat_info.key() == room.seats[i], StonkPitError::InvalidSeat);

        let mut seat_data = seat_info.try_borrow_mut_data()?;
        let mut seat: Seat = Seat::try_deserialize(&mut &seat_data[..])?;
        require!(seat.room == room.key(), StonkPitError::InvalidSeat);
        require!(seat.start_price > 0, StonkPitError::StalePrice);

        let end_price = read_stock_price(price_info, &seat.stock_mint, now)?;
        let score = score_bps(seat.start_price, end_price)?;
        seat.end_price = end_price;
        seat.score_bps = score;
        seat.try_serialize(&mut &mut seat_data[..])?;

        if score > best_score {
            best_score = score;
            winners.clear();
            winners.push(seat.player);
        } else if score == best_score {
            winners.push(seat.player);
        }
    }

    require!(!winners.is_empty(), StonkPitError::StalePrice);

    room.is_split = winners.len() > 1;
    room.winner_count = winners.len() as u8;
    room.winners = [Pubkey::default(); 8];
    for (i, winner) in winners.iter().enumerate() {
        room.winners[i] = *winner;
    }
    room.status = RoomStatus::Settled;

    Ok(())
}

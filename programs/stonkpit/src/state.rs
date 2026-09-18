use anchor_lang::prelude::*;

use crate::constants::MAX_PLAYERS;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RoomStatus {
    Open,
    Locked,
    Settled,
    Refunded,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub min_players: u8,
    pub max_players: u8,
    #[max_len(8)]
    pub allowed_mints: Vec<Pubkey>,
    pub usdc_mint: Pubkey,
    pub paused: bool,
    pub next_room_id: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Room {
    pub room_id: u64,
    pub status: RoomStatus,
    pub stake_amount: u64,
    pub duration_secs: i64,
    pub created_ts: i64,
    pub lock_ts: i64,
    pub end_ts: i64,
    pub player_count: u8,
    pub pot: u64,
    pub is_split: bool,
    pub winner_count: u8,
    pub fee_collected: bool,
    pub winners: [Pubkey; MAX_PLAYERS],
    pub seats: [Pubkey; MAX_PLAYERS],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Seat {
    pub room: Pubkey,
    pub player: Pubkey,
    pub stock_mint: Pubkey,
    pub deposited: u64,
    pub start_price: i64,
    pub end_price: i64,
    pub score_bps: i64,
    pub claimed: bool,
    pub bump: u8,
}

/// Devnet-only admin-posted price for a stock label. Not used on mainnet.
#[account]
#[derive(InitSpace)]
pub struct MockPrice {
    pub stock_mint: Pubkey,
    pub price: i64,
    pub updated_ts: i64,
    pub bump: u8,
}

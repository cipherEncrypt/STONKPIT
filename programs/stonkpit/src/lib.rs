pub mod constants;
pub mod error;
pub mod instructions;
pub mod pyth_util;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("DVWAgqjsK7jCVWu2ArL6PVcpdvGbdeVCwnsWBJcGFBi");

#[program]
pub mod stonkpit {
    use super::*;

    pub fn init_config(
        ctx: Context<InitConfig>,
        treasury: Pubkey,
        usdc_mint: Pubkey,
        fee_bps: u16,
        min_players: u8,
        max_players: u8,
        allowed_mints: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::init_config::handle_init_config(
            ctx,
            treasury,
            usdc_mint,
            fee_bps,
            min_players,
            max_players,
            allowed_mints,
        )
    }

    pub fn post_mock_price(
        ctx: Context<PostMockPrice>,
        stock_mint: Pubkey,
        price: i64,
    ) -> Result<()> {
        instructions::post_mock_price::handle_post_mock_price(ctx, stock_mint, price)
    }

    pub fn create_room(ctx: Context<CreateRoom>, stake_amount: u64, duration_secs: i64) -> Result<()> {
        instructions::create_room::handle_create_room(ctx, stake_amount, duration_secs)
    }

    pub fn join_room(ctx: Context<JoinRoom>, stock_mint: Pubkey) -> Result<()> {
        instructions::join_room::handle_join_room(ctx, stock_mint)
    }

    pub fn lock_room(ctx: Context<LockRoom>) -> Result<()> {
        instructions::lock_room::handle_lock_room(ctx)
    }

    pub fn settle_room(ctx: Context<SettleRoom>) -> Result<()> {
        instructions::settle_room::handle_settle_room(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handle_claim(ctx)
    }

    pub fn refund_room<'info>(ctx: Context<'info, RefundRoom<'info>>) -> Result<()> {
        instructions::refund_room::handle_refund_room(ctx)
    }

    pub fn pause(ctx: Context<Pause>, paused: bool) -> Result<()> {
        instructions::pause::handle_pause(ctx, paused)
    }
}

#[cfg(test)]
mod ix_tests {
    use super::*;
    use anchor_lang::{AnchorDeserialize, InstructionData};

    #[test]
    fn init_config_ix_roundtrip() {
        let ix = instruction::InitConfig {
            treasury: Pubkey::default(),
            usdc_mint: Pubkey::default(),
            fee_bps: 300,
            min_players: 2,
            max_players: 8,
            allowed_mints: vec![AAPLX_MINT],
        };
        let data = ix.data();
        let mut slice = &data[8..];
        let back = instruction::InitConfig::deserialize(&mut slice).unwrap();
        assert_eq!(back.fee_bps, 300);
    }
}

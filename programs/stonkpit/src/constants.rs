use anchor_lang::prelude::*;

/// Mainnet Circle USDC (flip Config.usdc_mint when going live):
/// EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
/// Devnet USDC: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

pub const AAPLX_MINT: Pubkey = pubkey!("XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp");
pub const TSLAX_MINT: Pubkey = pubkey!("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
pub const NVDAX_MINT: Pubkey = pubkey!("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");

/// Mainnet Pyth push feeds (Equity.US.* / USD).
pub const PYTH_AAPL: Pubkey = pubkey!("CnJp9eTtoMPsgxFj7jYmi2qwyn5995unJ2CxzEmKuE5F");
pub const PYTH_TSLA: Pubkey = pubkey!("D3Nt3t1KRZT4KePKvRh9ePCfDCLZFjGoFrmbUTUCE3si");
pub const PYTH_NVDA: Pubkey = pubkey!("57jxZ9pM7nLByWRWisX1zPLW3h8EU2rnyeUEZv3mKCAN");

pub const MAX_PLAYERS: usize = 8;
pub const DEFAULT_FEE_BPS: u16 = 300;
pub const PYTH_MAX_AGE_SECS: i64 = 120;
pub const PYTH_MAX_CONF_BPS: u64 = 500;
/// Mock prices stay valid for 24h (devnet demo only).
pub const MOCK_MAX_AGE_SECS: i64 = 86_400;

pub fn pyth_feed_for_stock(stock_mint: &Pubkey) -> Option<Pubkey> {
    if *stock_mint == AAPLX_MINT {
        Some(PYTH_AAPL)
    } else if *stock_mint == TSLAX_MINT {
        Some(PYTH_TSLA)
    } else if *stock_mint == NVDAX_MINT {
        Some(PYTH_NVDA)
    } else {
        None
    }
}

pub fn mock_price_pda(stock_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"mock_price", stock_mint.as_ref()], &crate::ID)
}

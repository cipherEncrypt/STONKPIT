use anchor_lang::prelude::*;

use crate::constants::{mock_price_pda, pyth_feed_for_stock, MOCK_MAX_AGE_SECS, PYTH_MAX_AGE_SECS, PYTH_MAX_CONF_BPS};
use crate::error::StonkPitError;
use crate::state::MockPrice;

const MIN_PYTH_LEN: usize = 240;
const AGG_OFFSET: usize = 208;

struct AggPrice {
    price: i64,
    conf: u64,
    publish_time: i64,
    status: u32,
}

fn parse_pyth_agg(data: &[u8]) -> Result<AggPrice> {
    require!(data.len() >= MIN_PYTH_LEN, StonkPitError::StalePrice);
    let chunk = &data[AGG_OFFSET..AGG_OFFSET + 32];
    let price = i64::from_le_bytes(chunk[0..8].try_into().unwrap());
    let conf = u64::from_le_bytes(chunk[8..16].try_into().unwrap());
    let status = u32::from_le_bytes(chunk[16..20].try_into().unwrap());
    let publish_time = i64::from_le_bytes(data[184..192].try_into().unwrap());
    Ok(AggPrice {
        price,
        conf,
        publish_time,
        status,
    })
}

fn read_pyth_price(account: &AccountInfo, now: i64) -> Result<i64> {
    let data = account.try_borrow_data()?;
    let agg = parse_pyth_agg(&data)?;
    require!(agg.status == 1, StonkPitError::StalePrice);
    require!(agg.price > 0, StonkPitError::StalePrice);
    let age = now.saturating_sub(agg.publish_time);
    require!(age <= PYTH_MAX_AGE_SECS, StonkPitError::StalePrice);
    let conf_bps = (agg.conf as u128)
        .saturating_mul(10_000)
        .checked_div(agg.price as u128)
        .unwrap_or(u128::MAX);
    require!(conf_bps <= PYTH_MAX_CONF_BPS as u128, StonkPitError::StalePrice);
    Ok(agg.price)
}

fn read_mock_price(account: &AccountInfo, now: i64) -> Result<i64> {
    let data = account.try_borrow_data()?;
    let mock = MockPrice::try_deserialize(&mut &data[..])?;
    require!(mock.price > 0, StonkPitError::StalePrice);
    let age = now.saturating_sub(mock.updated_ts);
    require!(age <= MOCK_MAX_AGE_SECS, StonkPitError::StalePrice);
    Ok(mock.price)
}

/// Accept Pyth push feed OR admin MockPrice PDA for this stock label.
pub fn read_stock_price(account: &AccountInfo, stock_mint: &Pubkey, now: i64) -> Result<i64> {
    let (mock_pda, _) = mock_price_pda(stock_mint);
    if account.key() == mock_pda {
        return read_mock_price(account, now);
    }
    if let Some(pyth) = pyth_feed_for_stock(stock_mint) {
        if account.key() == pyth {
            return read_pyth_price(account, now);
        }
    }
    Err(StonkPitError::InvalidPythFeed.into())
}

pub fn score_bps(start: i64, end: i64) -> Result<i64> {
    require!(start > 0, StonkPitError::StalePrice);
    let delta = (end - start) as i128 * 10_000;
    Ok((delta / start as i128) as i64)
}

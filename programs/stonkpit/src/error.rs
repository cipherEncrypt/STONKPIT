use anchor_lang::prelude::*;

#[error_code]
pub enum StonkPitError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Unknown or disallowed stock mint")]
    UnknownMint,
    #[msg("Room is not open")]
    RoomNotOpen,
    #[msg("Room is not locked")]
    RoomNotLocked,
    #[msg("Room already settled or refunded")]
    RoomClosed,
    #[msg("Room is full")]
    RoomFull,
    #[msg("Not enough players to lock")]
    NotEnoughPlayers,
    #[msg("Lock window not reached")]
    TooEarlyToLock,
    #[msg("Settlement window not reached")]
    TooEarlyToSettle,
    #[msg("Stale or invalid Pyth price")]
    StalePrice,
    #[msg("Player already joined this room")]
    AlreadyJoined,
    #[msg("Invalid seat account")]
    InvalidSeat,
    #[msg("Invalid Pyth feed account")]
    InvalidPythFeed,
    #[msg("Wrong number of price accounts")]
    InvalidPriceAccounts,
    #[msg("Not a winner")]
    NotWinner,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Refund not allowed in current state")]
    RefundNotAllowed,
    #[msg("USDC mint mismatch — only Circle USDC allowed")]
    WrongUsdcMint,
    #[msg("Invalid vault mint")]
    WrongVaultMint,
    #[msg("Unauthorized admin")]
    Unauthorized,
}

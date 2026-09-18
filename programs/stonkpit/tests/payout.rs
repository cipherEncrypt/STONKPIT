//! End-to-end payout via LiteSVM (mock prices, USDC vault).

use anchor_lang::InstructionData;
use litesvm::LiteSVM;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_pubkey::{pubkey, Pubkey};
use solana_signer::Signer;
use solana_system_interface::program as system_program;
use solana_transaction::Transaction;

use stonkpit::constants::{AAPLX_MINT, TSLAX_MINT};
use stonkpit::ID as PROGRAM_ID;

const TOKEN_PROGRAM: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const CLOCK_SYSVAR: Pubkey = pubkey!("SysvarC1ock11111111111111111111111111111111");

fn to_pk(p: spl_token::solana_program::pubkey::Pubkey) -> Pubkey {
    Pubkey::new_from_array(p.to_bytes())
}

fn spl_ix(ix: spl_token::solana_program::instruction::Instruction) -> Instruction {
    Instruction {
        program_id: to_pk(ix.program_id),
        accounts: ix
            .accounts
            .into_iter()
            .map(|m| {
                if m.is_writable {
                    AccountMeta::new(to_pk(m.pubkey), m.is_signer)
                } else {
                    AccountMeta::new_readonly(to_pk(m.pubkey), m.is_signer)
                }
            })
            .collect(),
        data: ix.data,
    }
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ixs: Vec<Instruction>) -> solana_signature::Signature {
    send_with(svm, payer, ixs, &[payer])
}

fn send_with(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ixs: Vec<Instruction>,
    signers: &[&Keypair],
) -> solana_signature::Signature {
    let tx = Transaction::new(
        signers,
        Message::new(&ixs, Some(&payer.pubkey())),
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).expect("tx failed").signature
}

#[test]
fn two_player_payout_with_mock_prices() {
    let mut svm = LiteSVM::new()
        .with_sysvars()
        .with_builtins()
        .with_default_programs()
        .with_sigverify(false);

    let so_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/target/sbpf-solana-solana/release/deps/stonkpit.so"
    );
    let _ = svm.add_program_from_file(PROGRAM_ID, so_path);

    let admin = Keypair::new();
    let treasury = Keypair::new();
    let player1 = Keypair::new();
    let player2 = Keypair::new();
    let usdc_mint = Keypair::new();

    for kp in [&admin, &player1, &player2] {
        svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
    }

    create_mint(&mut svm, &admin, &usdc_mint, 6);

    let (config, _) = Pubkey::find_program_address(&[b"config"], &PROGRAM_ID);

    let init_data = stonkpit::instruction::InitConfig {
        treasury: treasury.pubkey(),
        usdc_mint: usdc_mint.pubkey(),
        fee_bps: 300,
        min_players: 2,
        max_players: 8,
        allowed_mints: vec![AAPLX_MINT, TSLAX_MINT],
    }
    .data();

    send(
        &mut svm,
        &admin,
        vec![Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(admin.pubkey(), true),
                AccountMeta::new(config, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: init_data,
        }],
    );

    let room_id = 1u64;
    let (room, _) =
        Pubkey::find_program_address(&[b"room", &room_id.to_le_bytes()], &PROGRAM_ID);
    let vault = ata(&room, &usdc_mint.pubkey());

    send(
        &mut svm,
        &admin,
        vec![Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(admin.pubkey(), true),
                AccountMeta::new(config, false),
                AccountMeta::new(room, false),
                AccountMeta::new_readonly(usdc_mint.pubkey(), false),
                AccountMeta::new(vault, false),
                AccountMeta::new_readonly(TOKEN_PROGRAM, false),
                AccountMeta::new_readonly(ATA_PROGRAM, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: stonkpit::instruction::CreateRoom {
                stake_amount: 1_000_000,
                duration_secs: 15,
            }
            .data(),
        }],
    );

    let p1_usdc = mint_to(&mut svm, &admin, &usdc_mint, &player1, 5_000_000);
    let p2_usdc = mint_to(&mut svm, &admin, &usdc_mint, &player2, 5_000_000);

    let (seat1, _) = Pubkey::find_program_address(
        &[b"seat", room.as_ref(), player1.pubkey().as_ref()],
        &PROGRAM_ID,
    );
    let (seat2, _) = Pubkey::find_program_address(
        &[b"seat", room.as_ref(), player2.pubkey().as_ref()],
        &PROGRAM_ID,
    );

    post_mock(&mut svm, &admin, config, AAPLX_MINT, 10_000);
    post_mock(&mut svm, &admin, config, TSLAX_MINT, 20_000);

    join(&mut svm, &player1, config, room, seat1, p1_usdc, vault, AAPLX_MINT);
    join(&mut svm, &player2, config, room, seat2, p2_usdc, vault, TSLAX_MINT);

    let (aapl_mock, _) =
        Pubkey::find_program_address(&[b"mock_price", AAPLX_MINT.as_ref()], &PROGRAM_ID);
    let (tsla_mock, _) =
        Pubkey::find_program_address(&[b"mock_price", TSLAX_MINT.as_ref()], &PROGRAM_ID);

    send(
        &mut svm,
        &admin,
        vec![Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new_readonly(config, false),
                AccountMeta::new(room, false),
                AccountMeta::new(seat1, false),
                AccountMeta::new(seat2, false),
                AccountMeta::new_readonly(aapl_mock, false),
                AccountMeta::new_readonly(tsla_mock, false),
            ],
            data: stonkpit::instruction::LockRoom {}.data(),
        }],
    );

    let mut clock: solana_clock::Clock = bincode::deserialize(
        &svm.get_account(&CLOCK_SYSVAR).expect("clock").data,
    )
    .unwrap();
    clock.unix_timestamp += 16;
    svm.set_sysvar(&clock);

    post_mock(&mut svm, &admin, config, AAPLX_MINT, 11_000);
    post_mock(&mut svm, &admin, config, TSLAX_MINT, 20_400);

    send(
        &mut svm,
        &admin,
        vec![Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new_readonly(config, false),
                AccountMeta::new(room, false),
                AccountMeta::new(seat1, false),
                AccountMeta::new(seat2, false),
                AccountMeta::new_readonly(aapl_mock, false),
                AccountMeta::new_readonly(tsla_mock, false),
            ],
            data: stonkpit::instruction::SettleRoom {}.data(),
        }],
    );

    let before = token_balance(&svm, &p1_usdc);
    let treasury_usdc = ata(&treasury.pubkey(), &usdc_mint.pubkey());
    create_ata(&mut svm, &admin, &treasury, &usdc_mint);

    let claim_sig = send(
        &mut svm,
        &player1,
        vec![Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(player1.pubkey(), true),
                AccountMeta::new_readonly(config, false),
                AccountMeta::new(room, false),
                AccountMeta::new(seat1, false),
                AccountMeta::new(vault, false),
                AccountMeta::new(p1_usdc, false),
                AccountMeta::new_readonly(treasury.pubkey(), false),
                AccountMeta::new(treasury_usdc, false),
                AccountMeta::new_readonly(TOKEN_PROGRAM, false),
                AccountMeta::new_readonly(ATA_PROGRAM, false),
            ],
            data: stonkpit::instruction::Claim {}.data(),
        }],
    );

    let after = token_balance(&svm, &p1_usdc);
    assert!(after > before, "winner USDC must increase: before={before} after={after}");
    eprintln!("\n=== PAYOUT OK ===");
    eprintln!("claim tx: {claim_sig}");
    eprintln!("winner USDC before: {before}");
    eprintln!("winner USDC after:  {after}");
    eprintln!("delta: {}", after - before);
}

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), TOKEN_PROGRAM.as_ref(), mint.as_ref()],
        &ATA_PROGRAM,
    )
    .0
}

fn create_mint(svm: &mut LiteSVM, payer: &Keypair, mint: &Keypair, decimals: u8) {
    let rent = svm.minimum_balance_for_rent_exemption(82);
    let create_ix = solana_system_interface::instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        rent,
        82,
        &TOKEN_PROGRAM,
    );
    let init_ix = spl_ix(
        spl_token::instruction::initialize_mint(
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(TOKEN_PROGRAM.to_bytes()),
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(mint.pubkey().to_bytes()),
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(payer.pubkey().to_bytes()),
            None,
            decimals,
        )
        .unwrap(),
    );
    send_with(svm, payer, vec![create_ix, init_ix], &[payer, mint]);
}

fn mint_to(svm: &mut LiteSVM, auth: &Keypair, mint: &Keypair, owner: &Keypair, amt: u64) -> Pubkey {
    create_ata(svm, auth, owner, mint);
    let ata = ata(&owner.pubkey(), &mint.pubkey());
    let ix = spl_ix(
        spl_token::instruction::mint_to(
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(TOKEN_PROGRAM.to_bytes()),
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(mint.pubkey().to_bytes()),
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(ata.to_bytes()),
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(auth.pubkey().to_bytes()),
            &[],
            amt,
        )
        .unwrap(),
    );
    send(svm, auth, vec![ix]);
    ata
}

fn create_ata(svm: &mut LiteSVM, payer: &Keypair, owner: &Keypair, mint: &Keypair) {
    let ix = spl_ix(
        spl_associated_token_account::instruction::create_associated_token_account(
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(payer.pubkey().to_bytes()),
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(owner.pubkey().to_bytes()),
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(mint.pubkey().to_bytes()),
            &spl_token::solana_program::pubkey::Pubkey::new_from_array(TOKEN_PROGRAM.to_bytes()),
        ),
    );
    send(svm, payer, vec![ix]);
}

fn post_mock(svm: &mut LiteSVM, admin: &Keypair, config: Pubkey, stock: Pubkey, price: i64) {
    let (mock, _) = Pubkey::find_program_address(&[b"mock_price", stock.as_ref()], &PROGRAM_ID);
    send(
        svm,
        admin,
        vec![Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(admin.pubkey(), true),
                AccountMeta::new_readonly(config, false),
                AccountMeta::new(mock, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: stonkpit::instruction::PostMockPrice { stock_mint: stock, price }.data(),
        }],
    );
}

fn join(
    svm: &mut LiteSVM,
    player: &Keypair,
    config: Pubkey,
    room: Pubkey,
    seat: Pubkey,
    player_usdc: Pubkey,
    vault: Pubkey,
    stock: Pubkey,
) {
    send(
        svm,
        player,
        vec![Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(player.pubkey(), true),
                AccountMeta::new_readonly(config, false),
                AccountMeta::new(room, false),
                AccountMeta::new(seat, false),
                AccountMeta::new(player_usdc, false),
                AccountMeta::new(vault, false),
                AccountMeta::new_readonly(TOKEN_PROGRAM, false),
                AccountMeta::new_readonly(ATA_PROGRAM, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: stonkpit::instruction::JoinRoom { stock_mint: stock }.data(),
        }],
    );
}

fn token_balance(svm: &LiteSVM, ata: &Pubkey) -> u64 {
    use spl_token::solana_program::program_pack::Pack;
    let acc = svm.get_account(ata).expect("token account");
    spl_token::state::Account::unpack(&acc.data).expect("unpack").amount
}

use base64::{engine::general_purpose::STANDARD, Engine as _};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_address::{address, Address};
use solana_instruction::{account_meta::AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_sdk_ids::system_program;
use solana_signer::Signer;
use solana_transaction::Transaction;
use std::path::PathBuf;

const PROGRAM_ID: Address = address!("HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C");
const TREASURY: Address = address!("FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be");
const RELEASE_DISCRIMINATOR: [u8; 8] = [253, 249, 15, 206, 28, 127, 193, 241];
const PARTIAL_RELEASE_DISCRIMINATOR: [u8; 8] = [20, 4, 101, 245, 53, 131, 213, 8];
const PLATFORM_FEE_EVENT_DISCRIMINATOR: [u8; 8] = [248, 27, 99, 34, 79, 13, 224, 207];
const ESCROW_ACCOUNT_DISCRIMINATOR: [u8; 8] = [145, 108, 37, 52, 197, 162, 232, 59];
const STARTING_RECIPIENT_LAMPORTS: u64 = 1_000_000;
const ESCROW_RENT_LAMPORTS: u64 = 5_000_000;
const RELEASED_AMOUNT_OFFSET: usize = 112;
const STATUS_OFFSET: usize = 172;
const ACTIVE_STATUS: u8 = 0;
const RELEASED_STATUS: u8 = 2;

struct Fixture {
    svm: LiteSVM,
    client: Keypair,
    escrow: Address,
    agent: Address,
    gross: u64,
}

fn candidate_program() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop();
    path.pop();
    path.push("target/fee-routing-candidate/escrow_v3.so");
    assert!(
        path.is_file(),
        "build the pinned candidate first with scripts/build-escrow-v3-fee-routing-candidate.sh"
    );
    path
}

fn serialized_escrow(client: Address, agent: Address, gross: u64) -> Vec<u8> {
    let mut data = Vec::with_capacity(408);
    data.extend_from_slice(&ESCROW_ACCOUNT_DISCRIMINATOR);
    data.extend_from_slice(client.as_ref());
    data.extend_from_slice(agent.as_ref());
    data.extend_from_slice(&[7; 32]);
    data.extend_from_slice(&gross.to_le_bytes());
    data.extend_from_slice(&0_u64.to_le_bytes());
    data.extend_from_slice(&[9; 32]);
    data.extend_from_slice(&i64::MAX.to_le_bytes());
    data.extend_from_slice(&1_u64.to_le_bytes());
    data.push(0); // EscrowCurrency::Sol
    data.push(0); // token_mint: None
    data.push(0); // token_vault: None
    data.push(0); // token_decimals: None
    data.push(ACTIVE_STATUS);
    data.push(0); // min_verification_level
    data.push(0); // require_born
    data.extend_from_slice(&1_i64.to_le_bytes());
    data.extend_from_slice(&[0; 32]); // arbiter
    data.push(0); // work_hash: None
    data.push(0); // work_submitted_at: None
    data.push(0); // dispute_reason_hash: None
    data.push(0); // disputed_at: None
    data.push(0); // disputed_by: None
    data.push(255); // bump
    data.resize(408, 0);
    data
}

fn fixture(gross: u64) -> Fixture {
    let client = Keypair::new();
    let escrow = Address::new_unique();
    let agent = Address::new_unique();
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(PROGRAM_ID, candidate_program())
        .expect("load pinned candidate SBF");
    svm.airdrop(&client.pubkey(), 1_000_000_000)
        .expect("fund transaction payer");
    svm.set_account(
        escrow,
        Account {
            lamports: ESCROW_RENT_LAMPORTS + gross,
            data: serialized_escrow(client.pubkey(), agent, gross),
            owner: PROGRAM_ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .expect("install escrow fixture");
    for recipient in [agent, TREASURY] {
        svm.set_account(
            recipient,
            Account {
                lamports: STARTING_RECIPIENT_LAMPORTS,
                data: Vec::new(),
                owner: system_program::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .expect("install recipient fixture");
    }
    Fixture {
        svm,
        client,
        escrow,
        agent,
        gross,
    }
}

fn instruction(
    fixture: &Fixture,
    discriminator: [u8; 8],
    amount: Option<u64>,
    treasury: Address,
) -> Instruction {
    let mut data = discriminator.to_vec();
    if let Some(amount) = amount {
        data.extend_from_slice(&amount.to_le_bytes());
    }
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(fixture.escrow, false),
            AccountMeta::new_readonly(fixture.client.pubkey(), true),
            AccountMeta::new(fixture.agent, false),
            AccountMeta::new(treasury, false),
        ],
        data,
    }
}

fn transaction(fixture: &Fixture, instruction: Instruction) -> Transaction {
    let blockhash = fixture.svm.latest_blockhash();
    Transaction::new(
        &[&fixture.client],
        Message::new_with_blockhash(&[instruction], Some(&fixture.client.pubkey()), &blockhash),
        blockhash,
    )
}

fn escrow_state(svm: &LiteSVM, escrow: Address) -> Account {
    svm.get_account(&escrow).expect("escrow account")
}

fn released_amount(account: &Account) -> u64 {
    u64::from_le_bytes(
        account.data[RELEASED_AMOUNT_OFFSET..RELEASED_AMOUNT_OFFSET + 8]
            .try_into()
            .unwrap(),
    )
}

fn recipient_balance(svm: &LiteSVM, recipient: Address) -> u64 {
    svm.get_account(&recipient)
        .expect("recipient account")
        .lamports
}

fn assert_fee_event(logs: &[String]) {
    assert!(
        logs.iter().any(|log| {
            log.strip_prefix("Program data: ")
                .and_then(|data| STANDARD.decode(data).ok())
                .is_some_and(|data| data.starts_with(&PLATFORM_FEE_EVENT_DISCRIMINATOR))
        }),
        "PlatformFeeRouted event discriminator missing from logs: {logs:?}"
    );
}

fn account_snapshot(svm: &LiteSVM, keys: &[Address]) -> Vec<Account> {
    keys.iter()
        .map(|key| svm.get_account(key).expect("snapshot account"))
        .collect()
}

#[test]
fn release_routes_fee_to_fixed_treasury_and_finalizes_state() {
    let mut fixture = fixture(10_000);
    let tx = transaction(
        &fixture,
        instruction(&fixture, RELEASE_DISCRIMINATOR, None, TREASURY),
    );
    let metadata = fixture.svm.send_transaction(tx).expect("release succeeds");

    assert_eq!(
        recipient_balance(&fixture.svm, fixture.agent),
        STARTING_RECIPIENT_LAMPORTS + 9_500
    );
    assert_eq!(
        recipient_balance(&fixture.svm, TREASURY),
        STARTING_RECIPIENT_LAMPORTS + 500
    );
    let state = escrow_state(&fixture.svm, fixture.escrow);
    assert_eq!(state.lamports, ESCROW_RENT_LAMPORTS);
    assert_eq!(released_amount(&state), fixture.gross);
    assert_eq!(state.data[STATUS_OFFSET], RELEASED_STATUS);
    assert_fee_event(&metadata.logs);
}

#[test]
fn partial_release_routes_fee_and_keeps_residual_active() {
    let mut fixture = fixture(20_000);
    let tx = transaction(
        &fixture,
        instruction(
            &fixture,
            PARTIAL_RELEASE_DISCRIMINATOR,
            Some(10_000),
            TREASURY,
        ),
    );
    let metadata = fixture
        .svm
        .send_transaction(tx)
        .expect("partial release succeeds");

    assert_eq!(
        recipient_balance(&fixture.svm, fixture.agent),
        STARTING_RECIPIENT_LAMPORTS + 9_500
    );
    assert_eq!(
        recipient_balance(&fixture.svm, TREASURY),
        STARTING_RECIPIENT_LAMPORTS + 500
    );
    let state = escrow_state(&fixture.svm, fixture.escrow);
    assert_eq!(state.lamports, ESCROW_RENT_LAMPORTS + 10_000);
    assert_eq!(released_amount(&state), 10_000);
    assert_eq!(state.data[STATUS_OFFSET], ACTIVE_STATUS);
    assert_fee_event(&metadata.logs);
}

#[test]
fn wrong_treasury_fails_before_mutation_and_rolls_back_all_accounts() {
    let mut fixture = fixture(10_000);
    let wrong_treasury = Address::new_unique();
    fixture
        .svm
        .set_account(
            wrong_treasury,
            Account {
                lamports: STARTING_RECIPIENT_LAMPORTS,
                data: Vec::new(),
                owner: system_program::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    let keys = [fixture.escrow, fixture.agent, TREASURY, wrong_treasury];
    let before = account_snapshot(&fixture.svm, &keys);
    let tx = transaction(
        &fixture,
        instruction(&fixture, RELEASE_DISCRIMINATOR, None, wrong_treasury),
    );
    let failure = fixture
        .svm
        .send_transaction(tx)
        .expect_err("wrong treasury fails");

    assert!(failure
        .meta
        .logs
        .iter()
        .any(|log| log.contains("WrongTreasury")));
    assert_eq!(account_snapshot(&fixture.svm, &keys), before);
}

#[test]
fn excessive_partial_release_fails_and_rolls_back_state_and_balances() {
    let mut fixture = fixture(10_000);
    let keys = [fixture.escrow, fixture.agent, TREASURY];
    let before = account_snapshot(&fixture.svm, &keys);
    let tx = transaction(
        &fixture,
        instruction(
            &fixture,
            PARTIAL_RELEASE_DISCRIMINATOR,
            Some(fixture.gross + 1),
            TREASURY,
        ),
    );
    let failure = fixture
        .svm
        .send_transaction(tx)
        .expect_err("excessive partial release fails");

    assert!(failure
        .meta
        .logs
        .iter()
        .any(|log| log.contains("InsufficientFunds")));
    assert_eq!(account_snapshot(&fixture.svm, &keys), before);
}

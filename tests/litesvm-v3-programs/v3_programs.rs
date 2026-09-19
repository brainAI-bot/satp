use litesvm::LiteSVM;
use solana_account::Account;
use solana_address::{address, Address};
use solana_instruction::{account_meta::AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_sdk_ids::system_program;
use solana_sha256_hasher::hash;
use solana_signer::Signer;
use solana_transaction::Transaction;
use std::path::PathBuf;

const ATTESTATIONS_ID: Address = address!("55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw");
const ESCROW_ID: Address = address!("B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg");
const IDENTITY_ID: Address = address!("7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ");
const REPUTATION_ID: Address = address!("CtmZ1fHaypt3R6wbeiGawiRnjzRK9T8jsECk9mET9AK9");
const REVIEWS_ID: Address = address!("3yVFrWCpBnQdWNqmiCG9EpoZq7WYeQ421Gx5sUh41Kwk");
const VALIDATION_ID: Address = address!("DLB76DzAFY8KNuvnP79BZW3cehGreEQTeGDvFCNd2Ekj");
const TREASURY: Address = address!("FriU1FEpWbdgVrTcS49YV5mVv2oqN6poaVQjzq2BS5be");

const CREATE_IDENTITY: [u8; 8] = [12, 253, 209, 41, 176, 51, 195, 179];
const UPDATE_IDENTITY: [u8; 8] = [130, 54, 88, 104, 222, 124, 238, 252];
const CREATE_ATTESTATION: [u8; 8] = [49, 24, 67, 80, 12, 249, 96, 239];
const VERIFY_ATTESTATION: [u8; 8] = [144, 30, 116, 186, 33, 176, 35, 60];
const INIT_REVIEW_COUNTER: [u8; 8] = [22, 101, 236, 30, 237, 207, 181, 36];
const CREATE_REVIEW: [u8; 8] = [69, 237, 87, 43, 238, 125, 40, 1];
const UPDATE_REVIEW: [u8; 8] = [254, 84, 60, 221, 68, 163, 94, 29];
const RECOMPUTE_REPUTATION: [u8; 8] = [236, 193, 222, 116, 54, 55, 49, 217];
const RECOMPUTE_LEVEL: [u8; 8] = [188, 71, 22, 212, 156, 164, 238, 88];
const RELEASE: [u8; 8] = [253, 249, 15, 206, 28, 127, 193, 241];
const ESCROW_ACCOUNT_DISCRIMINATOR: [u8; 8] = [145, 108, 37, 52, 197, 162, 232, 59];

fn artifact(name: &str) -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop();
    path.pop();
    path.push("target/v3-litesvm-programs");
    path.push(format!("{name}.so"));
    assert!(path.is_file(), "missing SBF artifact {}", path.display());
    path
}

fn svm_with(programs: &[(&str, Address)]) -> LiteSVM {
    let mut svm = LiteSVM::new();
    for (name, id) in programs {
        svm.add_program_from_file(*id, artifact(name))
            .unwrap_or_else(|error| panic!("load {name}: {error}"));
    }
    svm
}

fn fund(svm: &mut LiteSVM, signer: &Keypair) {
    svm.airdrop(&signer.pubkey(), 5_000_000_000)
        .expect("fund transaction signer");
}

fn system_account(svm: &mut LiteSVM, key: Address) {
    svm.set_account(
        key,
        Account {
            lamports: 1_000_000,
            data: Vec::new(),
            owner: system_program::ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .expect("install system account");
}

fn send(svm: &mut LiteSVM, signer: &Keypair, instruction: Instruction) -> Result<(), Vec<String>> {
    let blockhash = svm.latest_blockhash();
    let transaction = Transaction::new(
        &[signer],
        Message::new_with_blockhash(&[instruction], Some(&signer.pubkey()), &blockhash),
        blockhash,
    );
    svm.send_transaction(transaction)
        .map(|_| ())
        .map_err(|failure| failure.meta.logs)
}

fn put_string(data: &mut Vec<u8>, value: &str) {
    data.extend_from_slice(&(value.len() as u32).to_le_bytes());
    data.extend_from_slice(value.as_bytes());
}

fn identity_fixture(svm: &mut LiteSVM, creator: &Keypair, suffix: &str) -> Address {
    let agent_hash = hash(format!("agent-{suffix}").as_bytes()).to_bytes();
    let (genesis, _) = Address::find_program_address(&[b"genesis", &agent_hash], &IDENTITY_ID);
    let mut data = CREATE_IDENTITY.to_vec();
    data.extend_from_slice(&agent_hash);
    put_string(&mut data, "Test Agent");
    put_string(&mut data, "LiteSVM identity");
    put_string(&mut data, "testing");
    data.extend_from_slice(&0_u32.to_le_bytes()); // empty capabilities Vec
    put_string(&mut data, "https://example.invalid/agent.json");
    send(
        svm,
        creator,
        Instruction {
            program_id: IDENTITY_ID,
            accounts: vec![
                AccountMeta::new(genesis, false),
                AccountMeta::new(creator.pubkey(), true),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        },
    )
    .unwrap_or_else(|logs| panic!("create_identity failed: {logs:?}"));
    assert!(svm.get_account(&genesis).is_some());
    genesis
}

fn assert_authorization_failure(logs: &[String]) {
    assert!(
        logs.iter().any(|log| {
            log.contains("ConstraintHasOne")
                || log.contains("ConstraintSeeds")
                || log.contains("Unauthorized")
                || log.contains("has one")
        }),
        "expected authorization failure log, got {logs:?}"
    );
}

#[test]
fn identity_happy_path_and_unauthorized_authority_failure() {
    let creator = Keypair::new();
    let intruder = Keypair::new();
    let mut svm = svm_with(&[("identity_v3", IDENTITY_ID)]);
    fund(&mut svm, &creator);
    fund(&mut svm, &intruder);
    let genesis = identity_fixture(&mut svm, &creator, "identity");
    let before = svm.get_account(&genesis).unwrap();

    let mut data = UPDATE_IDENTITY.to_vec();
    data.extend_from_slice(&[0, 0, 0, 0, 0]); // five None arguments
    let logs = send(
        &mut svm,
        &intruder,
        Instruction {
            program_id: IDENTITY_ID,
            accounts: vec![
                AccountMeta::new(genesis, false),
                AccountMeta::new_readonly(intruder.pubkey(), true),
            ],
            data,
        },
    )
    .expect_err("non-authority must not update identity");
    assert_authorization_failure(&logs);
    assert_eq!(svm.get_account(&genesis).unwrap(), before);
}

#[test]
fn attestations_happy_path_and_unauthorized_issuer_failure() {
    let issuer = Keypair::new();
    let intruder = Keypair::new();
    let mut svm = svm_with(&[("attestations_v3", ATTESTATIONS_ID)]);
    fund(&mut svm, &issuer);
    fund(&mut svm, &intruder);
    let agent_id = "agent-attestation";
    let attestation_type = "github";
    let agent_hash = hash(agent_id.as_bytes()).to_bytes();
    let (attestation, _) = Address::find_program_address(
        &[
            b"attestation_v3",
            &agent_hash,
            issuer.pubkey().as_ref(),
            attestation_type.as_bytes(),
        ],
        &ATTESTATIONS_ID,
    );
    let mut data = CREATE_ATTESTATION.to_vec();
    put_string(&mut data, agent_id);
    put_string(&mut data, attestation_type);
    put_string(&mut data, "proof:read-only-fixture");
    data.push(0); // expires_at: None
    send(
        &mut svm,
        &issuer,
        Instruction {
            program_id: ATTESTATIONS_ID,
            accounts: vec![
                AccountMeta::new(attestation, false),
                AccountMeta::new(issuer.pubkey(), true),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data,
        },
    )
    .unwrap_or_else(|logs| panic!("create_attestation failed: {logs:?}"));
    let before = svm.get_account(&attestation).unwrap();

    let logs = send(
        &mut svm,
        &intruder,
        Instruction {
            program_id: ATTESTATIONS_ID,
            accounts: vec![
                AccountMeta::new(attestation, false),
                AccountMeta::new_readonly(intruder.pubkey(), true),
            ],
            data: VERIFY_ATTESTATION.to_vec(),
        },
    )
    .expect_err("non-issuer must not verify attestation");
    assert_authorization_failure(&logs);
    assert_eq!(svm.get_account(&attestation).unwrap(), before);
}

#[test]
fn reviews_happy_path_and_unauthorized_reviewer_failure() {
    let reviewer = Keypair::new();
    let intruder = Keypair::new();
    let mut svm = svm_with(&[("reviews_v3", REVIEWS_ID)]);
    fund(&mut svm, &reviewer);
    fund(&mut svm, &intruder);
    let agent_id = "agent-review";
    let agent_hash = hash(agent_id.as_bytes()).to_bytes();
    let (counter, _) =
        Address::find_program_address(&[b"review_counter_v3", &agent_hash], &REVIEWS_ID);
    let mut init_data = INIT_REVIEW_COUNTER.to_vec();
    put_string(&mut init_data, agent_id);
    send(
        &mut svm,
        &reviewer,
        Instruction {
            program_id: REVIEWS_ID,
            accounts: vec![
                AccountMeta::new(counter, false),
                AccountMeta::new(reviewer.pubkey(), true),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: init_data,
        },
    )
    .unwrap_or_else(|logs| panic!("init_review_counter failed: {logs:?}"));

    let (review, _) = Address::find_program_address(
        &[b"review_v3", &agent_hash, reviewer.pubkey().as_ref()],
        &REVIEWS_ID,
    );
    let mut create_data = CREATE_REVIEW.to_vec();
    put_string(&mut create_data, agent_id);
    create_data.push(5);
    put_string(&mut create_data, "excellent");
    put_string(&mut create_data, "litesvm");
    send(
        &mut svm,
        &reviewer,
        Instruction {
            program_id: REVIEWS_ID,
            accounts: vec![
                AccountMeta::new(review, false),
                AccountMeta::new(counter, false),
                AccountMeta::new(reviewer.pubkey(), true),
                AccountMeta::new_readonly(system_program::ID, false),
                AccountMeta::new_readonly(system_program::ID, false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: create_data,
        },
    )
    .unwrap_or_else(|logs| panic!("create_review failed: {logs:?}"));
    let before = svm.get_account(&review).unwrap();

    let mut update_data = UPDATE_REVIEW.to_vec();
    update_data.extend_from_slice(&[0, 0, 0]); // three None arguments
    let logs = send(
        &mut svm,
        &intruder,
        Instruction {
            program_id: REVIEWS_ID,
            accounts: vec![
                AccountMeta::new(review, false),
                AccountMeta::new_readonly(intruder.pubkey(), true),
            ],
            data: update_data,
        },
    )
    .expect_err("non-reviewer must not update review");
    assert_authorization_failure(&logs);
    assert_eq!(svm.get_account(&review).unwrap(), before);
}

fn recompute_fixture(target_name: &str, target_id: Address, discriminator: [u8; 8], seed: &[u8]) {
    let caller = Keypair::new();
    let mut svm = svm_with(&[("identity_v3", IDENTITY_ID), (target_name, target_id)]);
    fund(&mut svm, &caller);
    let genesis = identity_fixture(&mut svm, &caller, target_name);
    let (authority, _) = Address::find_program_address(&[seed], &target_id);
    system_account(&mut svm, authority);
    let before_happy = svm.get_account(&genesis).unwrap();

    send(
        &mut svm,
        &caller,
        Instruction {
            program_id: target_id,
            accounts: vec![
                AccountMeta::new(genesis, false),
                AccountMeta::new_readonly(authority, false),
                AccountMeta::new_readonly(IDENTITY_ID, false),
                AccountMeta::new_readonly(caller.pubkey(), true),
            ],
            data: discriminator.to_vec(),
        },
    )
    .unwrap_or_else(|logs| panic!("{target_name} recompute happy path failed: {logs:?}"));

    let before = svm.get_account(&genesis).unwrap();
    assert_ne!(
        before, before_happy,
        "{target_name} recompute must update identity state"
    );
    let wrong_authority = Address::new_unique();
    system_account(&mut svm, wrong_authority);
    let logs = send(
        &mut svm,
        &caller,
        Instruction {
            program_id: target_id,
            accounts: vec![
                AccountMeta::new(genesis, false),
                AccountMeta::new_readonly(wrong_authority, false),
                AccountMeta::new_readonly(IDENTITY_ID, false),
                AccountMeta::new_readonly(caller.pubkey(), true),
            ],
            data: discriminator.to_vec(),
        },
    )
    .expect_err("wrong program authority PDA must fail");
    assert_authorization_failure(&logs);
    assert_eq!(svm.get_account(&genesis).unwrap(), before);
}

#[test]
fn reputation_happy_path_and_unauthorized_program_authority_failure() {
    recompute_fixture(
        "reputation_v3",
        REPUTATION_ID,
        RECOMPUTE_REPUTATION,
        b"reputation_v3_authority",
    );
}

#[test]
fn validation_happy_path_and_unauthorized_program_authority_failure() {
    recompute_fixture(
        "validation_v3",
        VALIDATION_ID,
        RECOMPUTE_LEVEL,
        b"validation_v3_authority",
    );
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
    data.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0]);
    data.extend_from_slice(&1_i64.to_le_bytes());
    data.extend_from_slice(&[0; 32]);
    data.extend_from_slice(&[0, 0, 0, 0, 0]);
    data.push(255);
    data.resize(408, 0);
    data
}

fn escrow_fixture() -> (LiteSVM, Keypair, Address, Address) {
    let client = Keypair::new();
    let escrow = Address::new_unique();
    let agent = Address::new_unique();
    let mut svm = svm_with(&[("escrow_v3", ESCROW_ID)]);
    fund(&mut svm, &client);
    svm.set_account(
        escrow,
        Account {
            lamports: 5_010_000,
            data: serialized_escrow(client.pubkey(), agent, 10_000),
            owner: ESCROW_ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
    system_account(&mut svm, agent);
    system_account(&mut svm, TREASURY);
    (svm, client, escrow, agent)
}

fn release_instruction(escrow: Address, client: Address, agent: Address) -> Instruction {
    Instruction {
        program_id: ESCROW_ID,
        accounts: vec![
            AccountMeta::new(escrow, false),
            AccountMeta::new_readonly(client, true),
            AccountMeta::new(agent, false),
            AccountMeta::new(TREASURY, false),
        ],
        data: RELEASE.to_vec(),
    }
}

#[test]
fn escrow_happy_path_and_unauthorized_client_failure() {
    let (mut happy_svm, client, escrow, agent) = escrow_fixture();
    let happy_before = happy_svm.get_account(&escrow).unwrap();
    send(
        &mut happy_svm,
        &client,
        release_instruction(escrow, client.pubkey(), agent),
    )
    .unwrap_or_else(|logs| panic!("escrow release failed: {logs:?}"));
    assert_ne!(
        happy_svm.get_account(&escrow).unwrap(),
        happy_before,
        "escrow release must update escrow state"
    );

    let (mut denied_svm, _authorized_client, denied_escrow, denied_agent) = escrow_fixture();
    let intruder = Keypair::new();
    fund(&mut denied_svm, &intruder);
    let before = denied_svm.get_account(&denied_escrow).unwrap();
    let logs = send(
        &mut denied_svm,
        &intruder,
        release_instruction(denied_escrow, intruder.pubkey(), denied_agent),
    )
    .expect_err("non-client must not release escrow");
    assert_authorization_failure(&logs);
    assert_eq!(denied_svm.get_account(&denied_escrow).unwrap(), before);
}

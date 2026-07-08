#!/usr/bin/env node

const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
} = require('@solana/web3.js');
const {
  SATPV3SDK,
  getGenesisPDA,
  getV3MintTrackerPDA,
} = require('../packages/satp-client/src/index');

const DEVNET_IDENTITY_PROGRAM = '7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ';
const OFFLINE_BLOCKHASH = '11111111111111111111111111111111';
const WRITE_CONFIRMATION = 'I_UNDERSTAND_THIS_WRITES_TO_DEVNET';

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArg(name, fallback = null) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function classifyExpectedFailure(error) {
  const text = String(error && (error.logs || error.message || error));
  if (/MintLimitReached|custom program error: 0x1773|6003/.test(text)) return 'mint_cap_enforced';
  if (/AlreadyBorn|custom program error: 0x1772|6002/.test(text)) return 'soulbound_second_birth_rejected';
  return `unexpected_failure: ${text.slice(0, 240)}`;
}

function readMintTracker(data) {
  const body = Buffer.from(data).slice(8);
  return {
    identity: new PublicKey(body.slice(0, 32)).toBase58(),
    mintCount: body[32],
    lastMintTimestamp: Number(body.readBigInt64LE(33)),
    bump: body[41],
  };
}

async function sendExpectedFailure(connection, tx, signers, expected) {
  try {
    await sendAndConfirmTransaction(connection, tx, signers, { commitment: 'confirmed' });
  } catch (error) {
    const classified = classifyExpectedFailure(error);
    assert(classified === expected, `expected ${expected}, got ${classified}`);
    return classified;
  }
  throw new Error(`expected ${expected}, but transaction succeeded`);
}

async function sendTx(connection, tx, signers) {
  return sendAndConfirmTransaction(connection, tx, signers, { commitment: 'confirmed' });
}

async function run() {
  const offline = hasFlag('--offline');
  const execute = hasFlag('--execute-devnet-writes');
  const rpcUrl = getArg('--rpc-url', process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com');
  const agentId = getArg('--agent-id', `satp-fbc35f6e-${Date.now()}`);
  const sdk = new SATPV3SDK({ network: 'devnet', rpcUrl });

  assert(
    sdk.programIds.IDENTITY.toBase58() === DEVNET_IDENTITY_PROGRAM,
    `SDK devnet identity mismatch: ${sdk.programIds.IDENTITY.toBase58()}`,
  );

  if (offline) {
    sdk.connection = { getLatestBlockhash: async () => ({ blockhash: OFFLINE_BLOCKHASH }) };
  }

  if (execute) {
    assert(!offline, '--execute-devnet-writes cannot be combined with --offline');
    assert(
      process.env.SATP_DEVNET_E2E_CONFIRM_WRITES === WRITE_CONFIRMATION,
      `set SATP_DEVNET_E2E_CONFIRM_WRITES=${WRITE_CONFIRMATION} to run live devnet writes`,
    );
  }

  const authority = Keypair.generate();
  const rotatedAuthority = Keypair.generate();
  const faceMint = Keypair.generate().publicKey;
  const [genesisPDA] = getGenesisPDA(agentId, 'devnet');
  const [mintTrackerPDA] = getV3MintTrackerPDA(genesisPDA, 'devnet');

  if (offline) {
    const create = await sdk.buildCreateIdentity(authority.publicKey, agentId, {
      name: 'FBC35F6E E2E',
      description: 'Burn-to-Become devnet proof fixture',
      category: 'verification',
      capabilities: ['burn', 'mint-cap', 'rotation'],
      metadataUri: 'ipfs://satp-fbc35f6e',
    });
    const burn = await sdk.buildBurnToBecome(
      authority.publicKey,
      agentId,
      'ipfs://satp-fbc35f6e-face',
      faceMint,
      '1111111111111111111111111111111111111111111111111111111111111111',
    );
    const initTracker = await sdk.buildInitMintTracker(authority.publicKey, agentId);
    const recordMint = await sdk.buildRecordMint(authority.publicKey, agentId);
    const propose = await sdk.buildProposeAuthority(authority.publicKey, agentId, rotatedAuthority.publicKey);
    const accept = await sdk.buildAcceptAuthority(rotatedAuthority.publicKey, agentId);
    const rotatedRecordMint = await sdk.buildRecordMint(rotatedAuthority.publicKey, agentId);
    const attemptedSoulboundTransfer = SystemProgram.transfer({
      fromPubkey: genesisPDA,
      toPubkey: rotatedAuthority.publicKey,
      lamports: 1,
    });

    assert(create.genesisPDA.equals(genesisPDA), 'create identity uses deployed identity genesis PDA');
    assert(initTracker.mintTrackerPDA.equals(mintTrackerPDA), 'mint tracker is seeded by genesis identity');
    assert(recordMint.transaction.instructions[0].keys[1].pubkey.equals(mintTrackerPDA), 'record mint hits genesis-scoped mint tracker');
    assert(rotatedRecordMint.transaction.instructions[0].keys[1].pubkey.equals(mintTrackerPDA), 'rotated authority still hits same mint tracker');
    assert(propose.transaction.instructions[0].programId.equals(sdk.programIds.IDENTITY), 'authority proposal targets deployed identity program');
    assert(accept.transaction.instructions[0].programId.equals(sdk.programIds.IDENTITY), 'authority acceptance targets deployed identity program');
    assert(burn.transaction.instructions[0].programId.equals(sdk.programIds.IDENTITY), 'burn-to-become targets deployed identity program');
    assert(attemptedSoulboundTransfer.keys[0].pubkey.equals(genesisPDA), 'soulbound transfer attempt targets genesis PDA');
    assert(attemptedSoulboundTransfer.keys[0].isSigner, 'system transfer would require impossible PDA signature');

    console.log(JSON.stringify({
      mode: 'offline_no_write',
      marker: '[#fbc35f6e]',
      programId: sdk.programIds.IDENTITY.toBase58(),
      agentId,
      genesisPDA: genesisPDA.toBase58(),
      mintTrackerPDA: mintTrackerPDA.toBase58(),
      proofs: {
        freeMintInstructionBuilds: true,
        threePerIdentityCapPath: 'record_mint enforces mint_count < 3 on genesis-scoped mint_tracker',
        walletRotationCarriesCap: true,
        soulboundTransferFailsPath: 'genesis PDA cannot sign a system transfer; live mode also checks second burn_to_become rejection',
      },
    }, null, 2));
    return;
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const programInfo = await connection.getAccountInfo(sdk.programIds.IDENTITY);
  assert(programInfo && programInfo.executable, 'deployed identity_v3 program is not executable on devnet');

  if (!execute) {
    console.log(JSON.stringify({
      mode: 'read_only_no_write',
      marker: '[#fbc35f6e]',
      programId: sdk.programIds.IDENTITY.toBase58(),
      executable: true,
      agentId,
      genesisPDA: genesisPDA.toBase58(),
      mintTrackerPDA: mintTrackerPDA.toBase58(),
      approvalRequired: `Live e2e writes are gated. Re-run with --execute-devnet-writes and SATP_DEVNET_E2E_CONFIRM_WRITES=${WRITE_CONFIRMATION}.`,
    }, null, 2));
    return;
  }

  const airdropSig = await connection.requestAirdrop(authority.publicKey, LAMPORTS_PER_SOL);
  await connection.confirmTransaction(airdropSig, 'confirmed');

  const create = await sdk.buildCreateIdentity(authority.publicKey, agentId, {
    name: 'FBC35F6E E2E',
    description: 'Burn-to-Become devnet proof fixture',
    category: 'verification',
    capabilities: ['burn', 'mint-cap', 'rotation'],
    metadataUri: 'ipfs://satp-fbc35f6e',
  });
  const createSig = await sendTx(connection, create.transaction, [authority]);

  const burn = await sdk.buildBurnToBecome(
    authority.publicKey,
    agentId,
    'ipfs://satp-fbc35f6e-face',
    faceMint,
    createSig,
  );
  const burnSig = await sendTx(connection, burn.transaction, [authority]);

  const init = await sdk.buildInitMintTracker(authority.publicKey, agentId);
  const initMintTrackerSig = await sendTx(connection, init.transaction, [authority]);

  const mintSigs = [];
  for (let i = 0; i < 3; i += 1) {
    const recordMint = await sdk.buildRecordMint(authority.publicKey, agentId);
    mintSigs.push(await sendTx(connection, recordMint.transaction, [authority]));
  }

  const fourthMint = await sdk.buildRecordMint(authority.publicKey, agentId);
  const capFailure = await sendExpectedFailure(connection, fourthMint.transaction, [authority], 'mint_cap_enforced');

  const propose = await sdk.buildProposeAuthority(authority.publicKey, agentId, rotatedAuthority.publicKey);
  const proposeSig = await sendTx(connection, propose.transaction, [authority]);
  const accept = await sdk.buildAcceptAuthority(rotatedAuthority.publicKey, agentId);
  const acceptSig = await sendTx(connection, accept.transaction, [rotatedAuthority]);

  const rotatedFourthMint = await sdk.buildRecordMint(rotatedAuthority.publicKey, agentId);
  const rotatedCapFailure = await sendExpectedFailure(
    connection,
    rotatedFourthMint.transaction,
    [rotatedAuthority],
    'mint_cap_enforced',
  );

  const secondBurn = await sdk.buildBurnToBecome(
    rotatedAuthority.publicKey,
    agentId,
    'ipfs://satp-fbc35f6e-transfer-attempt',
    Keypair.generate().publicKey,
    acceptSig,
  );
  const soulboundFailure = await sendExpectedFailure(
    connection,
    secondBurn.transaction,
    [rotatedAuthority],
    'soulbound_second_birth_rejected',
  );

  const trackerInfo = await connection.getAccountInfo(mintTrackerPDA);
  assert(trackerInfo, 'mint tracker missing after live e2e');
  const tracker = readMintTracker(trackerInfo.data);
  assert(tracker.identity === genesisPDA.toBase58(), 'mint tracker identity mismatch');
  assert(tracker.mintCount === 3, `expected mint_count 3, got ${tracker.mintCount}`);

  console.log(JSON.stringify({
    mode: 'executed_devnet_writes',
    marker: '[#fbc35f6e]',
    programId: sdk.programIds.IDENTITY.toBase58(),
    agentId,
    genesisPDA: genesisPDA.toBase58(),
    mintTrackerPDA: mintTrackerPDA.toBase58(),
    signatures: {
      airdrop: airdropSig,
      createIdentity: createSig,
      burnToBecome: burnSig,
      initMintTracker: initMintTrackerSig,
      recordMints: mintSigs,
      proposeAuthority: proposeSig,
      acceptAuthority: acceptSig,
    },
    failures: {
      fourthMint: capFailure,
      rotatedFourthMint: rotatedCapFailure,
      secondBurnToBecome: soulboundFailure,
    },
    mintTracker: tracker,
  }, null, 2));
}

run().catch((error) => {
  console.error(`BLOCKER burn_become_devnet_e2e ${error.message}`);
  process.exit(1);
});

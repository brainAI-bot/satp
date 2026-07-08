#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { deserializeAccount } = require('../packages/satp-client/src/borsh-reader');

const DEVNET_RPC = process.env.SATP_DEVNET_RPC || 'https://api.devnet.solana.com';
const DEVNET_IDENTITY_PROGRAM_ID =
  process.env.SATP_IDENTITY_PROGRAM_ID || '7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ';
const MAX_MINTS_PER_IDENTITY = 3;
const APPROVAL_ENV = 'SATP_DEVNET_E2E_APPROVED';
const KEYPAIR_ENV = 'SATP_DEVNET_KEYPAIR';

function hasFlag(name) {
  return process.argv.includes(name);
}

const FLAGS = {
  execute: hasFlag('--execute'),
  json: hasFlag('--json'),
  offline: hasFlag('--offline'),
  plan: hasFlag('--plan') || !hasFlag('--execute'),
};

function anchorDiscriminator(ixName) {
  return crypto.createHash('sha256')
    .update(`global:${ixName}`)
    .digest()
    .slice(0, 8);
}

function serializeString(str) {
  const value = String(str || '');
  const bytes = Buffer.from(value, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

function serializeVecString(values) {
  const count = Buffer.alloc(4);
  count.writeUInt32LE(values.length);
  return Buffer.concat([count, ...values.map(serializeString)]);
}

function hashAgentId(agentId) {
  return crypto.createHash('sha256').update(agentId, 'utf8').digest();
}

function getGenesisPDA(agentIdOrHash, programId) {
  const hash = Buffer.isBuffer(agentIdOrHash) ? agentIdOrHash : hashAgentId(agentIdOrHash);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('genesis'), hash],
    programId
  );
}

function getMintTrackerPDA(genesisPDA, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('mint_tracker'), new PublicKey(genesisPDA).toBuffer()],
    programId
  );
}

function createIdentityIx(programId, creator, agentId, meta) {
  const agentIdHash = hashAgentId(agentId);
  const [genesisPDA] = getGenesisPDA(agentIdHash, programId);
  const data = Buffer.concat([
    anchorDiscriminator('create_identity'),
    agentIdHash,
    serializeString(meta.name),
    serializeString(meta.description),
    serializeString(meta.category),
    serializeVecString(meta.capabilities || []),
    serializeString(meta.metadataUri),
  ]);

  return {
    pda: genesisPDA,
    ix: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: genesisPDA, isSigner: false, isWritable: true },
        { pubkey: creator, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }),
  };
}

function burnToBecomeIx(programId, authority, agentId, faceImage, faceMint, faceBurnTx) {
  const [genesisPDA] = getGenesisPDA(agentId, programId);
  const data = Buffer.concat([
    anchorDiscriminator('burn_to_become'),
    serializeString(faceImage),
    new PublicKey(faceMint).toBuffer(),
    serializeString(faceBurnTx),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: genesisPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

function initMintTrackerIx(programId, authority, agentId) {
  const [genesisPDA] = getGenesisPDA(agentId, programId);
  const [mintTrackerPDA] = getMintTrackerPDA(genesisPDA, programId);
  return {
    pda: mintTrackerPDA,
    ix: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: genesisPDA, isSigner: false, isWritable: false },
        { pubkey: mintTrackerPDA, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: anchorDiscriminator('init_mint_tracker'),
    }),
  };
}

function recordMintIx(programId, authority, agentId) {
  const [genesisPDA] = getGenesisPDA(agentId, programId);
  const [mintTrackerPDA] = getMintTrackerPDA(genesisPDA, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: genesisPDA, isSigner: false, isWritable: false },
      { pubkey: mintTrackerPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: anchorDiscriminator('record_mint'),
  });
}

function proposeAuthorityIx(programId, authority, agentId, newAuthority) {
  const [genesisPDA] = getGenesisPDA(agentId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: genesisPDA, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([
      anchorDiscriminator('propose_authority'),
      new PublicKey(newAuthority).toBuffer(),
    ]),
  });
}

function acceptAuthorityIx(programId, newAuthority, agentId) {
  const [genesisPDA] = getGenesisPDA(agentId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: genesisPDA, isSigner: false, isWritable: true },
      { pubkey: newAuthority, isSigner: true, isWritable: false },
    ],
    data: anchorDiscriminator('accept_authority'),
  });
}

function loadKeypair(keypairPath) {
  const parsed = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function approvalPacket() {
  return {
    requiredAction: 'Approve one devnet signing/write run of the SATP Burn-to-Become e2e runner.',
    command: `SATP_DEVNET_E2E_APPROVED=1 ${KEYPAIR_ENV}=<redacted-devnet-keypair-path> node scripts/verify-burn-to-become-devnet-e2e.js --execute --json`,
    writes: [
      'create one temporary GenesisRecord on Solana devnet',
      'set burn_to_become face fields once on that temporary identity',
      'initialize one MintTracker PDA',
      'record exactly three mint events',
      'rotate authority to a generated in-memory devnet keypair',
      'simulate the fourth mint and second burn_to_become failure without committing those failing writes',
    ],
    guardrails: [
      'devnet only',
      'no mainnet write',
      'no keypair mutation or secret output',
      'no npm publish',
      'no production deploy or restart',
    ],
  };
}

function proofPlan(programId) {
  const sampleAuthority = Keypair.generate().publicKey;
  const rotationAuthority = Keypair.generate().publicKey;
  const agentId = `satp-fbc35f6e-plan-${Date.now()}`;
  const faceMint = Keypair.generate().publicKey;
  const create = createIdentityIx(programId, sampleAuthority, agentId, {
    name: 'BurnBecomeE2E',
    description: 'Temporary SATP burn-to-become devnet proof identity',
    category: 'verification',
    capabilities: ['burn-to-become', 'mint-cap'],
    metadataUri: 'ipfs://satp-burn-become-devnet-e2e',
  });
  const tracker = initMintTrackerIx(programId, sampleAuthority, agentId);

  return {
    marker: '[#fbc35f6e]',
    cluster: 'devnet',
    rpcUrl: DEVNET_RPC,
    identityProgram: programId.toBase58(),
    mode: FLAGS.execute ? 'execute' : 'plan',
    behaviors: [
      {
        name: 'free_mint_succeeds',
        proof: 'record_mint has no token, payment, price, or recipient account; execute mode commits three successful record_mint transactions after init_mint_tracker.',
      },
      {
        name: 'three_per_identity_cap_enforced_on_chain',
        proof: `execute mode commits ${MAX_MINTS_PER_IDENTITY} record_mint transactions, then simulates a fourth record_mint and requires a program error.`,
      },
      {
        name: 'wallet_rotation_carries_cap_by_identity',
        proof: 'execute mode rotates GenesisRecord authority and simulates record_mint with the new authority against the same MintTracker PDA; the cap must still fail.',
      },
      {
        name: 'soulbound_transfer_fails',
        proof: 'execute mode simulates a second burn_to_become with a different face mint after birth; the identity program must reject rebirth/face transfer.',
      },
    ],
    derivedAccounts: {
      sampleGenesisPDA: create.pda.toBase58(),
      sampleMintTrackerPDA: tracker.pda.toBase58(),
      sampleAuthority: sampleAuthority.toBase58(),
      sampleRotationAuthority: rotationAuthority.toBase58(),
      sampleFaceMint: faceMint.toBase58(),
    },
    approvalPacket: approvalPacket(),
  };
}

async function readProgram(connection, programId) {
  const account = await connection.getAccountInfo(programId);
  if (!account) {
    throw new Error(`identity program not found on devnet: ${programId.toBase58()}`);
  }
  return {
    exists: true,
    executable: account.executable,
    owner: account.owner.toBase58(),
    lamports: account.lamports,
    dataLength: account.data.length,
  };
}

async function sendTx(connection, payer, signers, ix, label) {
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const signature = await sendAndConfirmTransaction(connection, tx, [payer, ...signers], {
    commitment: 'confirmed',
  });
  return { label, signature };
}

async function simulateTx(connection, payer, signers, ix, label) {
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(payer, ...signers);
  const result = await connection.simulateTransaction(tx);
  return {
    label,
    err: result.value.err,
    logs: result.value.logs || [],
  };
}

function assertFailed(simulation, label) {
  if (!simulation.err) {
    throw new Error(`${label} unexpectedly succeeded`);
  }
}

async function fetchDecoded(connection, pubkey) {
  const account = await connection.getAccountInfo(pubkey);
  if (!account) return null;
  return deserializeAccount(account.data);
}

async function executeProof(programId) {
  if (process.env[APPROVAL_ENV] !== '1') {
    return {
      status: 'blocked',
      blocker: `missing ${APPROVAL_ENV}=1 for devnet signing/write execution`,
      approvalPacket: approvalPacket(),
    };
  }
  if (!process.env[KEYPAIR_ENV]) {
    return {
      status: 'blocked',
      blocker: `missing ${KEYPAIR_ENV}=<devnet keypair path>`,
      approvalPacket: approvalPacket(),
    };
  }

  const connection = new Connection(DEVNET_RPC, 'confirmed');
  const authority = loadKeypair(process.env[KEYPAIR_ENV]);
  const rotatedAuthority = Keypair.generate();
  const agentId = `satp-fbc35f6e-${Date.now()}`;
  const faceMint = Keypair.generate().publicKey;
  const faceImage = `ipfs://satp-fbc35f6e/${agentId}`;
  const faceBurnTx = 'burnproof-fbc35f6e-devnet';
  const programReadback = await readProgram(connection, programId);

  const create = createIdentityIx(programId, authority.publicKey, agentId, {
    name: 'BurnBecomeE2E',
    description: 'Temporary SATP burn-to-become devnet proof identity',
    category: 'verification',
    capabilities: ['burn-to-become', 'mint-cap'],
    metadataUri: 'ipfs://satp-burn-become-devnet-e2e',
  });
  const tracker = initMintTrackerIx(programId, authority.publicKey, agentId);
  const signatures = [];

  signatures.push(await sendTx(connection, authority, [], create.ix, 'create_identity'));
  signatures.push(await sendTx(
    connection,
    authority,
    [],
    burnToBecomeIx(programId, authority.publicKey, agentId, faceImage, faceMint, faceBurnTx),
    'burn_to_become'
  ));
  signatures.push(await sendTx(connection, authority, [], tracker.ix, 'init_mint_tracker'));
  for (let i = 1; i <= MAX_MINTS_PER_IDENTITY; i++) {
    signatures.push(await sendTx(
      connection,
      authority,
      [],
      recordMintIx(programId, authority.publicKey, agentId),
      `record_mint_${i}`
    ));
  }

  const fourthMint = await simulateTx(
    connection,
    authority,
    [],
    recordMintIx(programId, authority.publicKey, agentId),
    'record_mint_4_cap_failure'
  );
  assertFailed(fourthMint, 'record_mint_4_cap_failure');

  signatures.push(await sendTx(
    connection,
    authority,
    [],
    proposeAuthorityIx(programId, authority.publicKey, agentId, rotatedAuthority.publicKey),
    'propose_authority'
  ));
  signatures.push(await sendTx(
    connection,
    authority,
    [rotatedAuthority],
    acceptAuthorityIx(programId, rotatedAuthority.publicKey, agentId),
    'accept_authority'
  ));

  const rotatedMint = await simulateTx(
    connection,
    authority,
    [rotatedAuthority],
    recordMintIx(programId, rotatedAuthority.publicKey, agentId),
    'record_mint_after_rotation_cap_failure'
  );
  assertFailed(rotatedMint, 'record_mint_after_rotation_cap_failure');

  const secondBurn = await simulateTx(
    connection,
    authority,
    [rotatedAuthority],
    burnToBecomeIx(
      programId,
      rotatedAuthority.publicKey,
      agentId,
      `${faceImage}/transfer-attempt`,
      Keypair.generate().publicKey,
      'rebirth-transfer-attempt'
    ),
    'soulbound_rebirth_transfer_failure'
  );
  assertFailed(secondBurn, 'soulbound_rebirth_transfer_failure');

  const genesis = await fetchDecoded(connection, create.pda);
  const mintTracker = await fetchDecoded(connection, tracker.pda);

  return {
    status: 'passed',
    marker: '[#fbc35f6e]',
    cluster: 'devnet',
    rpcUrl: DEVNET_RPC,
    identityProgram: programId.toBase58(),
    programReadback,
    agentId,
    genesisPDA: create.pda.toBase58(),
    mintTrackerPDA: tracker.pda.toBase58(),
    faceMint: faceMint.toBase58(),
    signatures,
    assertions: {
      freeMintTransactionsSucceeded: signatures.filter(s => s.label.startsWith('record_mint_')).length === 3,
      fourthMintFailed: Boolean(fourthMint.err),
      rotatedAuthorityStillCapped: Boolean(rotatedMint.err),
      soulboundRebirthTransferFailed: Boolean(secondBurn.err),
      finalMintCount: mintTracker && mintTracker.data ? mintTracker.data.mintCount : null,
      finalAuthority: genesis && genesis.data ? genesis.data.authority : null,
    },
    failureSimulations: {
      fourthMint,
      rotatedMint,
      secondBurn,
    },
  };
}

async function main() {
  const programId = new PublicKey(DEVNET_IDENTITY_PROGRAM_ID);
  const plan = proofPlan(programId);

  if (FLAGS.execute) {
    const result = await executeProof(programId);
    output(result);
    process.exit(result.status === 'passed' ? 0 : 2);
  }

  if (!FLAGS.offline) {
    const connection = new Connection(DEVNET_RPC, 'confirmed');
    plan.programReadback = await readProgram(connection, programId);
  }

  output(plan);
}

function output(result) {
  if (FLAGS.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`SATP Burn-to-Become devnet e2e ${result.mode || result.status}`);
  console.log(`marker: ${result.marker || '[#fbc35f6e]'}`);
  console.log(`cluster: ${result.cluster || 'devnet'}`);
  console.log(`identityProgram: ${result.identityProgram || DEVNET_IDENTITY_PROGRAM_ID}`);
  if (result.blocker) console.log(`blocker: ${result.blocker}`);
  if (result.programReadback) {
    console.log(`programReadback: ${JSON.stringify(result.programReadback)}`);
  }
  if (result.behaviors) {
    for (const behavior of result.behaviors) {
      console.log(`behavior: ${behavior.name} - ${behavior.proof}`);
    }
  }
  if (result.signatures) {
    for (const signature of result.signatures) {
      console.log(`signature: ${signature.label} ${signature.signature}`);
    }
  }
  if (result.approvalPacket) {
    console.log(`approvalPacket: ${JSON.stringify(result.approvalPacket)}`);
  }
}

main().catch(err => {
  const result = {
    status: 'failed',
    marker: '[#fbc35f6e]',
    error: err.message,
    approvalPacket: FLAGS.execute ? undefined : approvalPacket(),
  };
  output(result);
  process.exit(1);
});

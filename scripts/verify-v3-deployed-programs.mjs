#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { PublicKey } from '@solana/web3.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const truthPath = resolve(root, 'docs/v3-deployed-truth.json');
const loaderId = 'BPFLoaderUpgradeab1e11111111111111111111111';
const metadataProgramId = new PublicKey('ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S');
const programStateTag = 2;
const programDataStateTag = 3;
const programDataHeaderBytes = 45;
const metadataHeaderBytes = 96;
const shtNobits = 8;
const allowedRpcMethods = new Set(['getAccountInfo']);
const defaultRetry = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  timeoutMs: 20_000,
});

const truth = JSON.parse(readFileSync(truthPath, 'utf8'));
export const programs = Object.freeze(truth.programs.map((record) => Object.freeze({
  name: record.program,
  programId: record.program_id,
  idlPath: record.canonical_source_idl.path,
  productionIdlPath: record.production_idl_path,
  artifactPath: record.source_reproducible ? 'target/deployed-truth/escrow_v3.so' : null,
  record,
})));

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readU64Le(bytes, offset) {
  return Number(bytes.readBigUInt64LE(offset));
}

export function parseElfLength(bytes) {
  invariant(bytes.length >= 64, 'deployed program is too short to contain an ELF header');
  invariant(bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])),
    'deployed program does not start with an ELF header');
  invariant(bytes[5] === 1, `unsupported ELF endianness ${bytes[5]}`);
  const tableEnds = [];
  let headerEnd;
  if (bytes[4] === 1) {
    headerEnd = bytes.readUInt16LE(40);
    const phoff = bytes.readUInt32LE(28);
    const shoff = bytes.readUInt32LE(32);
    const phentsize = bytes.readUInt16LE(42);
    const phnum = bytes.readUInt16LE(44);
    const shentsize = bytes.readUInt16LE(46);
    const shnum = bytes.readUInt16LE(48);
    if (phoff && phentsize && phnum) tableEnds.push(phoff + phentsize * phnum);
    if (shoff && shentsize && shnum) tableEnds.push(shoff + shentsize * shnum);
    for (let index = 0; index < phnum; index += 1) {
      const offset = phoff + index * phentsize;
      tableEnds.push(bytes.readUInt32LE(offset + 4) + bytes.readUInt32LE(offset + 16));
    }
    for (let index = 0; index < shnum; index += 1) {
      const offset = shoff + index * shentsize;
      if (bytes.readUInt32LE(offset + 4) !== shtNobits) {
        tableEnds.push(bytes.readUInt32LE(offset + 16) + bytes.readUInt32LE(offset + 20));
      }
    }
  } else if (bytes[4] === 2) {
    headerEnd = bytes.readUInt16LE(52);
    const phoff = readU64Le(bytes, 32);
    const shoff = readU64Le(bytes, 40);
    const phentsize = bytes.readUInt16LE(54);
    const phnum = bytes.readUInt16LE(56);
    const shentsize = bytes.readUInt16LE(58);
    const shnum = bytes.readUInt16LE(60);
    if (phoff && phentsize && phnum) tableEnds.push(phoff + phentsize * phnum);
    if (shoff && shentsize && shnum) tableEnds.push(shoff + shentsize * shnum);
    for (let index = 0; index < phnum; index += 1) {
      const offset = phoff + index * phentsize;
      tableEnds.push(readU64Le(bytes, offset + 8) + readU64Le(bytes, offset + 32));
    }
    for (let index = 0; index < shnum; index += 1) {
      const offset = shoff + index * shentsize;
      if (bytes.readUInt32LE(offset + 4) !== shtNobits) {
        tableEnds.push(readU64Le(bytes, offset + 24) + readU64Le(bytes, offset + 32));
      }
    }
  } else {
    throw new Error(`unsupported ELF class ${bytes[4]}`);
  }
  const length = Math.max(headerEnd, ...tableEnds);
  invariant(Number.isSafeInteger(length) && length > 0 && length <= bytes.length,
    `invalid ELF length ${length} for deployed allocation ${bytes.length}`);
  return length;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function retryDelay(attempt, response, { baseDelayMs, maxDelayMs }) {
  const retryAfter = response?.headers?.get?.('retry-after');
  const retryAfterSeconds = retryAfter === null || retryAfter === undefined
    ? Number.NaN
    : Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(maxDelayMs, retryAfterSeconds * 1_000);
  }
  return Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
}

/** A deliberately narrow client: configuration cannot enable transaction submission. */
export async function rpcCall(url, method, params, options = {}) {
  invariant(allowedRpcMethods.has(method), `RPC method ${method} is not read-only allowlisted`);
  const config = { ...defaultRetry, ...options };
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const sleepImpl = options.sleepImpl || sleep;
  invariant(Number.isInteger(config.maxAttempts) && config.maxAttempts >= 1 && config.maxAttempts <= 8,
    'maxAttempts must be an integer between 1 and 8');

  let last429;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (response.status === 429) {
      last429 = `HTTP 429 on attempt ${attempt}/${config.maxAttempts}`;
      if (attempt < config.maxAttempts) {
        await sleepImpl(retryDelay(attempt, response, config));
        continue;
      }
      break;
    }
    invariant(response.ok, `RPC HTTP ${response.status} ${response.statusText || ''}`.trim());
    const payload = await response.json();
    if (payload.error?.code === 429) {
      last429 = `JSON-RPC 429 on attempt ${attempt}/${config.maxAttempts}`;
      if (attempt < config.maxAttempts) {
        await sleepImpl(retryDelay(attempt, response, config));
        continue;
      }
      break;
    }
    invariant(!payload.error, `RPC ${method} failed: ${JSON.stringify(payload.error)}`);
    return payload.result;
  }
  throw new Error(`${last429}; bounded retry limit reached`);
}

function decodeRpcAccount(result, address) {
  invariant(result?.value, `account ${address} was not found`);
  const [encoded, encoding] = result.value.data;
  invariant(encoding === 'base64', `account ${address} returned ${encoding}, expected base64`);
  return { contextSlot: result.context?.slot, ...result.value, data: Buffer.from(encoded, 'base64') };
}

async function getAccount(rpcUrl, address, options) {
  const result = await rpcCall(rpcUrl, 'getAccountInfo', [
    address,
    { encoding: 'base64', commitment: 'finalized' },
  ], options);
  return decodeRpcAccount(result, address);
}

export function metadataAddress(programId) {
  const seed = Buffer.alloc(16);
  seed.write('idl', 'utf8');
  return PublicKey.findProgramAddressSync([
    new PublicKey(programId).toBuffer(),
    Buffer.alloc(0),
    seed,
  ], metadataProgramId)[0];
}

export function decodeProgramMetadata(data, programId) {
  invariant(data.length >= metadataHeaderBytes, 'Program Metadata account is shorter than its header');
  invariant(data[0] === 2, 'Program Metadata discriminator drifted');
  invariant(new PublicKey(data.subarray(1, 33)).toBase58() === programId,
    'Program Metadata program address drifted');
  invariant(data[65] === 1 && data[66] === 1,
    'Program Metadata must remain mutable canonical metadata');
  invariant(data.subarray(67, 83).toString('utf8').replace(/\0+$/u, '') === 'idl',
    'Program Metadata seed drifted');
  invariant(data[83] === 1, 'Program Metadata encoding must be UTF-8');
  invariant(data[84] === 2, 'Program Metadata compression must be zlib');
  invariant(data[85] === 1, 'Program Metadata format must be JSON');
  invariant(data[86] === 0, 'Program Metadata data source must be direct');
  const dataLength = data.readUInt32LE(87);
  const end = metadataHeaderBytes + dataLength;
  invariant(end <= data.length, 'Program Metadata content exceeds account allocation');
  invariant(data.subarray(end).every((byte) => byte === 0),
    'Program Metadata allocation padding is non-zero');
  return inflateSync(data.subarray(metadataHeaderBytes, end));
}

export function normalizeIdlAddress(idlBytes) {
  const normalized = JSON.parse(Buffer.isBuffer(idlBytes) ? idlBytes.toString('utf8') : idlBytes);
  normalized.address = '<normalized-program-address>';
  return normalized;
}

export function semanticIdlMatch(left, right) {
  return isDeepStrictEqual(normalizeIdlAddress(left), normalizeIdlAddress(right));
}

export function validateTruthRecord(manifest = truth) {
  invariant(manifest.schema_version === 1, 'deployed truth schema_version must be 1');
  invariant(manifest.cluster === 'mainnet-beta', 'deployed truth cluster must be mainnet-beta');
  invariant(manifest.source_reproducibility?.reproducible_programs === 1,
    'deployed truth must record exactly one reproducible program');
  invariant(manifest.source_reproducibility?.total_programs === 6,
    'deployed truth must record six programs');
  invariant(manifest.source_reproducibility?.known_source_gap_programs === 5,
    'deployed truth must record the five-program source gap');
  invariant(manifest.programs?.length === 6, 'deployed truth must contain six program records');
  invariant(new Set(manifest.programs.map(({ program }) => program)).size === 6,
    'deployed truth program names must be unique');
  for (const record of manifest.programs) {
    invariant(Number.isSafeInteger(record.last_written_slot) && record.last_written_slot > 0,
      `${record.program} last-written slot must be recorded`);
    invariant(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u.test(record.last_written_at_utc),
      `${record.program} last-written date must be ISO UTC`);
    for (const [label, stored] of [['binary', record.stored_binary], ['IDL', record.stored_idl]]) {
      invariant(Number.isSafeInteger(stored?.bytes) && stored.bytes > 0,
        `${record.program} stored ${label} size must be recorded`);
      invariant(/^[0-9a-f]{64}$/u.test(stored?.sha256),
        `${record.program} stored ${label} SHA-256 must be recorded`);
    }
    invariant(record.source_commit === 'unknown' || /^[0-9a-f]{40}$/u.test(record.source_commit),
      `${record.program} source_commit must be a full commit or literal unknown`);
    invariant(record.source_reproducible === (record.source_commit !== 'unknown'),
      `${record.program} source reproducibility and commit must agree`);
    const sourceIdl = readFileSync(resolve(root, record.canonical_source_idl.path));
    invariant(sourceIdl.length === record.canonical_source_idl.bytes,
      `${record.program} canonical source IDL size drifted`);
    invariant(sha256(sourceIdl) === record.canonical_source_idl.sha256,
      `${record.program} canonical source IDL hash drifted`);
    const productionIdl = readFileSync(resolve(root, record.production_idl_path));
    invariant(productionIdl.length === record.stored_idl.bytes,
      `${record.program} committed production IDL size drifted`);
    invariant(sha256(productionIdl) === record.stored_idl.sha256,
      `${record.program} committed production IDL hash drifted`);
  }
  return true;
}

async function verifyProgram(program, rpcUrl, outDir, rpcOptions) {
  const { record } = program;
  const sourceIdl = readFileSync(resolve(root, program.idlPath));
  const productionIdl = readFileSync(resolve(root, program.productionIdlPath));
  const programAccount = await getAccount(rpcUrl, program.programId, rpcOptions);
  invariant(programAccount.owner === loaderId, `${program.name} program owner drifted`);
  invariant(programAccount.executable === true, `${program.name} program is not executable`);
  invariant(programAccount.data.length === 36 && programAccount.data.readUInt32LE(0) === programStateTag,
    `${program.name} is not an upgradeable Program account`);

  const programDataAddress = new PublicKey(programAccount.data.subarray(4, 36)).toBase58();
  const programDataAccount = await getAccount(rpcUrl, programDataAddress, rpcOptions);
  invariant(programDataAccount.owner === loaderId, `${program.name} ProgramData owner drifted`);
  invariant(programDataAccount.data.length > programDataHeaderBytes
    && programDataAccount.data.readUInt32LE(0) === programDataStateTag,
  `${program.name} ProgramData layout drifted`);
  const lastWrittenSlot = Number(programDataAccount.data.readBigUInt64LE(4));
  const allocated = programDataAccount.data.subarray(programDataHeaderBytes);
  const deployedBinary = allocated.subarray(0, parseElfLength(allocated));
  invariant(allocated.subarray(deployedBinary.length).every((byte) => byte === 0),
    `${program.name} deployed allocation padding is non-zero`);

  const idlAddress = metadataAddress(program.programId);
  const metadataAccount = await getAccount(rpcUrl, idlAddress.toBase58(), rpcOptions);
  invariant(metadataAccount.owner === metadataProgramId.toBase58(),
    `${program.name} Program Metadata owner drifted`);
  const deployedIdl = decodeProgramMetadata(metadataAccount.data, program.programId);

  const storedDir = resolve(outDir, 'stored');
  const storedIdlDir = resolve(outDir, 'stored-idls');
  mkdirSync(storedDir, { recursive: true });
  mkdirSync(storedIdlDir, { recursive: true });
  const storedBinaryPath = resolve(storedDir, `${program.name}.so`);
  const storedIdlPath = resolve(storedIdlDir, `${program.name}.json`);
  writeFileSync(storedBinaryPath, deployedBinary);
  writeFileSync(storedIdlPath, deployedIdl);

  const binaryHash = sha256(deployedBinary);
  const idlHash = sha256(deployedIdl);
  const recordMatch = programDataAddress === record.program_data
    && lastWrittenSlot === record.last_written_slot
    && deployedBinary.length === record.stored_binary.bytes
    && binaryHash === record.stored_binary.sha256
    && deployedIdl.length === record.stored_idl.bytes
    && idlHash === record.stored_idl.sha256;
  const productionIdlMatch = semanticIdlMatch(productionIdl, deployedIdl);
  const sourceIdlMatch = semanticIdlMatch(sourceIdl, deployedIdl);
  const expectedSourceVerdict = record.canonical_source_idl.semantic_verdict_after_address_normalization;
  const sourceVerdict = sourceIdlMatch ? 'MATCH' : 'DIFFER_KNOWN_SOURCE_GAP';
  invariant(sourceVerdict === expectedSourceVerdict,
    `${program.name} source-IDL gap changed from ${expectedSourceVerdict} to ${sourceVerdict}`);

  let sourceBinaryVerdict = 'NOT_REPRODUCIBLE_KNOWN_SOURCE_GAP';
  if (record.source_reproducible) {
    invariant(program.artifactPath && existsSync(resolve(root, program.artifactPath)),
      `missing rebuilt reproducible artifact ${program.artifactPath}`);
    const artifact = readFileSync(resolve(root, program.artifactPath));
    sourceBinaryVerdict = artifact.equals(deployedBinary) ? 'MATCH' : 'DIFFER';
  }

  return {
    program: program.name,
    program_id: program.programId,
    program_data: programDataAddress,
    last_written_slot: lastWrittenSlot,
    last_written_at_utc: record.last_written_at_utc,
    observed_at_finalized_slot: Math.max(
      programAccount.contextSlot || 0,
      programDataAccount.contextSlot || 0,
      metadataAccount.contextSlot || 0,
    ),
    stored_deployed_binary: relative(root, storedBinaryPath),
    stored_deployed_binary_bytes: deployedBinary.length,
    stored_deployed_binary_sha256: binaryHash,
    stored_deployed_idl: relative(root, storedIdlPath),
    stored_deployed_idl_bytes: deployedIdl.length,
    stored_deployed_idl_sha256: idlHash,
    idl_account: idlAddress.toBase58(),
    source_commit: record.source_commit,
    source_binary_verdict: sourceBinaryVerdict,
    source_idl_verdict: sourceVerdict,
    production_idl_verdict: productionIdlMatch ? 'MATCH' : 'DIFFER',
    record_verdict: recordMatch ? 'MATCH' : 'DIFFER',
    comparison_completed: true,
  };
}

export function proofMatches(results) {
  return results.length === programs.length
    && results.every((result) => result.comparison_completed)
    && results.every((result) => result.record_verdict === 'MATCH')
    && results.every((result) => result.production_idl_verdict === 'MATCH')
    && results.every((result) => result.source_binary_verdict === 'MATCH'
      || result.source_binary_verdict === 'NOT_REPRODUCIBLE_KNOWN_SOURCE_GAP');
}

export async function verifyPrograms({
  rpcUrl = process.env.SATP_V3_RPC_URL_MAINNET || 'https://api.mainnet-beta.solana.com',
  outDir = resolve(root, 'target/v3-deployed-proof'),
  rpcOptions,
  verifyProgramImpl = verifyProgram,
} = {}) {
  validateTruthRecord();
  const results = [];
  for (const program of programs) {
    try {
      results.push(await verifyProgramImpl(program, rpcUrl, outDir, rpcOptions));
    } catch (error) {
      results.push({
        program: program.name,
        program_id: program.programId,
        source_commit: program.record.source_commit,
        record_verdict: 'NOT_COMPARED',
        production_idl_verdict: 'NOT_COMPARED',
        source_binary_verdict: program.record.source_reproducible ? 'NOT_COMPARED' : 'NOT_REPRODUCIBLE_KNOWN_SOURCE_GAP',
        source_idl_verdict: 'NOT_COMPARED',
        comparison_completed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const comparisonCompleted = results.every((result) => result.comparison_completed);
  const ok = proofMatches(results);
  return {
    ok,
    comparison_completed: comparisonCompleted,
    cluster: truth.cluster,
    truth_record: relative(root, truthPath),
    source_reproducibility: truth.source_reproducibility,
    summary: {
      compared_programs: results.length,
      record_matches: results.filter((result) => result.record_verdict === 'MATCH').length,
      record_differences: results.filter((result) => result.record_verdict === 'DIFFER').length,
      not_compared: results.filter((result) => !result.comparison_completed).length,
      production_idl_matches: results.filter((result) => result.production_idl_verdict === 'MATCH').length,
      source_binary_matches: results.filter((result) => result.source_binary_verdict === 'MATCH').length,
      known_source_binary_gaps: results.filter((result) =>
        result.source_binary_verdict === 'NOT_REPRODUCIBLE_KNOWN_SOURCE_GAP').length,
    },
    safety: {
      allowed_rpc_methods: [...allowedRpcMethods],
      transaction_submission: false,
      chain_mutation: false,
      idl_mutation: false,
      authority_mutation: false,
      keypair_access: false,
      balance_mutation: false,
      credential_access: false,
      admin_mutation: false,
      deploy: false,
    },
    retry: defaultRetry,
    results,
  };
}

async function main() {
  const outDir = resolve(root, 'target/v3-deployed-proof');
  mkdirSync(outDir, { recursive: true });
  let proof;
  try {
    proof = await verifyPrograms({ outDir });
  } catch (error) {
    proof = {
      ok: false,
      comparison_completed: false,
      cluster: truth.cluster || 'mainnet-beta',
      truth_record: relative(root, truthPath),
      fatal_error: error instanceof Error ? error.message : String(error),
      results: [],
    };
  }
  writeFileSync(resolve(outDir, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof, null, 2));
  invariant(proof.comparison_completed, 'six-program deployed truth readback did not complete');
  invariant(proof.ok, 'six-program deployed truth drifted from the immutable record');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`V3 deployed truth failed: ${error.message}`);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { PublicKey } from '@solana/web3.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
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

export const programs = Object.freeze([
  ['attestations_v3', '6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD'],
  ['escrow_v3', 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C'],
  ['identity_v3', 'GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG'],
  ['reputation_v3', '2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ'],
  ['reviews_v3', 'r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4'],
  ['validation_v3', '6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV'],
].map(([name, programId]) => Object.freeze({
  name,
  programId,
  artifactPath: `target/v3-deployed-proof/rebuilt/${name}.so`,
  idlPath: `idls/v3/${name}.json`,
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

/**
 * A deliberately narrow JSON-RPC client. The allowlist prevents this proof from
 * ever being extended into transaction submission by configuration alone.
 */
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
  return {
    ...result.value,
    data: Buffer.from(encoded, 'base64'),
  };
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

function assertCanonicalIdl(idlBytes, program) {
  const idl = JSON.parse(idlBytes.toString('utf8'));
  invariant(idl.metadata?.name === program.name,
    `${program.name} canonical IDL metadata.name drifted`);
  invariant(idl.metadata?.deployments?.mainnet === program.programId,
    `${program.name} canonical IDL mainnet deployment drifted`);
}

async function verifyProgram(program, rpcUrl, outDir, rpcOptions) {
  const artifactPath = resolve(root, program.artifactPath);
  const idlPath = resolve(root, program.idlPath);
  invariant(existsSync(artifactPath), `missing rebuilt artifact ${program.artifactPath}`);
  invariant(existsSync(idlPath), `missing canonical IDL ${program.idlPath}`);

  const artifact = readFileSync(artifactPath);
  const canonicalIdl = readFileSync(idlPath);
  assertCanonicalIdl(canonicalIdl, program);

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

  const allocated = programDataAccount.data.subarray(programDataHeaderBytes);
  const deployedBinaryLength = parseElfLength(allocated);
  const deployedBinary = allocated.subarray(0, deployedBinaryLength);
  const allocationPadding = allocated.subarray(deployedBinaryLength);
  invariant(allocationPadding.every((byte) => byte === 0),
    `${program.name} deployed allocation padding is non-zero`);
  const binaryMatch = artifact.equals(deployedBinary);

  const idlAddress = metadataAddress(program.programId);
  const metadataAccount = await getAccount(rpcUrl, idlAddress.toBase58(), rpcOptions);
  invariant(metadataAccount.owner === metadataProgramId.toBase58(),
    `${program.name} Program Metadata owner drifted`);
  const deployedIdl = decodeProgramMetadata(metadataAccount.data, program.programId);
  const idlMatch = canonicalIdl.equals(deployedIdl);

  const storedDir = resolve(outDir, 'stored');
  const storedIdlDir = resolve(outDir, 'stored-idls');
  mkdirSync(storedDir, { recursive: true });
  mkdirSync(storedIdlDir, { recursive: true });
  writeFileSync(resolve(storedDir, `${program.name}.so`), deployedBinary);
  writeFileSync(resolve(storedIdlDir, `${program.name}.json`), deployedIdl);

  return {
    program: program.name,
    program_id: program.programId,
    program_data: programDataAddress,
    idl_account: idlAddress.toBase58(),
    rebuilt_binary: relative(root, artifactPath),
    stored_deployed_binary: relative(root, resolve(storedDir, `${program.name}.so`)),
    rebuilt_binary_bytes: artifact.length,
    rebuilt_binary_sha256: sha256(artifact),
    stored_deployed_binary_bytes: deployedBinary.length,
    stored_deployed_binary_sha256: sha256(deployedBinary),
    canonical_idl: program.idlPath,
    stored_deployed_idl: relative(root, resolve(storedIdlDir, `${program.name}.json`)),
    canonical_idl_bytes: canonicalIdl.length,
    canonical_idl_sha256: sha256(canonicalIdl),
    stored_deployed_idl_bytes: deployedIdl.length,
    stored_deployed_idl_sha256: sha256(deployedIdl),
    binary_verdict: binaryMatch ? 'MATCH' : 'DIFFER',
    idl_verdict: idlMatch ? 'MATCH' : 'DIFFER',
    comparison_completed: true,
  };
}

export function proofMatches(results) {
  return results.length === programs.length
    && results.every((result) => result.comparison_completed)
    && results.every((result) =>
      result.binary_verdict === 'MATCH' && result.idl_verdict === 'MATCH');
}

export async function verifyPrograms({
  rpcUrl = process.env.SATP_V3_RPC_URL_MAINNET || 'https://api.mainnet-beta.solana.com',
  outDir = resolve(root, 'target/v3-deployed-proof'),
  rpcOptions,
  verifyProgramImpl = verifyProgram,
} = {}) {
  const results = [];
  for (const program of programs) {
    try {
      results.push(await verifyProgramImpl(program, rpcUrl, outDir, rpcOptions));
    } catch (error) {
      results.push({
        program: program.name,
        program_id: program.programId,
        binary_verdict: 'NOT_COMPARED',
        idl_verdict: 'NOT_COMPARED',
        comparison_completed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const comparisonCompleted = results.length === programs.length
    && results.every((result) => result.comparison_completed);
  const allMatch = proofMatches(results);
  return {
    ok: allMatch,
    comparison_completed: comparisonCompleted,
    cluster: 'mainnet-beta',
    summary: {
      compared_programs: results.length,
      binary_matches: results.filter((result) => result.binary_verdict === 'MATCH').length,
      binary_differences: results.filter((result) => result.binary_verdict === 'DIFFER').length,
      binary_not_compared: results.filter((result) => result.binary_verdict === 'NOT_COMPARED').length,
      idl_matches: results.filter((result) => result.idl_verdict === 'MATCH').length,
      idl_differences: results.filter((result) => result.idl_verdict === 'DIFFER').length,
      idl_not_compared: results.filter((result) => result.idl_verdict === 'NOT_COMPARED').length,
      comparison_errors: results.filter((result) => !result.comparison_completed).length,
      all_binary_match: results.every((result) => result.binary_verdict === 'MATCH'),
      all_idl_match: results.every((result) => result.idl_verdict === 'MATCH'),
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
  const proof = await verifyPrograms();
  console.log(JSON.stringify(proof, null, 2));
  invariant(proof.comparison_completed, 'six-program deployed proof did not complete');
  invariant(proof.ok, 'six-program deployed proof found binary or IDL drift');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`V3 deployed proof failed: ${error.message}`);
    process.exitCode = 1;
  }
}

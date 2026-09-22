import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { PublicKey } from '@solana/web3.js';
import {
  decodeProgramMetadata,
  metadataAddress,
  normalizeIdlAddress,
  proofMatches,
  programs,
  rpcCall,
  semanticIdlMatch,
  validateTruthRecord,
  verifyPrograms,
} from '../scripts/verify-v3-deployed-programs.mjs';

const workflow = readFileSync(
  new URL('../.github/workflows/escrow-v3-deployed-truth.yml', import.meta.url),
  'utf8',
);
const buildScript = readFileSync(
  new URL('../scripts/build-verify-v3-deployed-programs.sh', import.meta.url),
  'utf8',
);
const truth = JSON.parse(readFileSync(new URL('../docs/v3-deployed-truth.json', import.meta.url)));

function response({ status = 200, payload = { jsonrpc: '2.0', id: 1, result: {} }, retryAfter } = {}) {
  return {
    status,
    statusText: status === 429 ? 'Too Many Requests' : 'OK',
    ok: status >= 200 && status < 300,
    headers: { get: (name) => name === 'retry-after' ? retryAfter ?? null : null },
    json: async () => payload,
  };
}

function matchingResult(program) {
  return {
    program: program.name,
    comparison_completed: true,
    record_verdict: 'MATCH',
    production_idl_verdict: 'MATCH',
    source_binary_verdict: program.record.source_reproducible
      ? 'MATCH'
      : 'NOT_REPRODUCIBLE_KNOWN_SOURCE_GAP',
  };
}

test('immutable truth covers exactly six programs and records 1/6 reproducibility', () => {
  assert.equal(validateTruthRecord(truth), true);
  assert.deepEqual(programs.map(({ name }) => name), [
    'attestations_v3',
    'escrow_v3',
    'identity_v3',
    'reputation_v3',
    'reviews_v3',
    'validation_v3',
  ]);
  assert.deepEqual(truth.source_reproducibility, {
    reproducible_programs: 1,
    total_programs: 6,
    known_source_gap_programs: 5,
  });
  assert.equal(truth.programs.filter(({ source_commit }) => source_commit === 'unknown').length, 5);
  assert.equal(truth.programs.filter(({ source_reproducible }) => source_reproducible).length, 1);
  for (const program of programs) {
    assert.match(program.record.stored_binary.sha256, /^[0-9a-f]{64}$/u);
    assert.match(program.record.stored_idl.sha256, /^[0-9a-f]{64}$/u);
    assert.ok(program.record.stored_binary.bytes > 0);
    assert.ok(program.record.last_written_slot > 0);
    assert.match(program.record.last_written_at_utc, /Z$/u);
  }
});

test('production IDLs are full stored readbacks and mainnet attestations omit source-only instruction', () => {
  for (const program of programs) {
    const production = readFileSync(new URL(`../${program.productionIdlPath}`, import.meta.url));
    assert.equal(production.length, program.record.stored_idl.bytes);
    assert.equal(semanticIdlMatch(production, production), true);
  }
  const mainnetAttestations = JSON.parse(readFileSync(
    new URL('../idls/v3/mainnet/attestations_v3.json', import.meta.url),
  ));
  const sourceAttestations = JSON.parse(readFileSync(
    new URL('../idls/v3/attestations_v3.json', import.meta.url),
  ));
  assert.equal(mainnetAttestations.instructions.some(({ name }) => name === 'create_verified_attestation'), false);
  assert.equal(sourceAttestations.instructions.some(({ name }) => name === 'create_verified_attestation'), true);
});

test('semantic IDL comparison normalizes only the top-level program address', () => {
  const program = programs.find(({ name }) => name === 'escrow_v3');
  const production = readFileSync(new URL(`../${program.productionIdlPath}`, import.meta.url));
  const changedAddress = JSON.parse(production);
  changedAddress.address = '11111111111111111111111111111111';
  assert.equal(semanticIdlMatch(production, JSON.stringify(changedAddress)), true);
  changedAddress.metadata.name = 'drifted';
  assert.equal(semanticIdlMatch(production, JSON.stringify(changedAddress)), false);
  assert.equal(normalizeIdlAddress(production).address, '<normalized-program-address>');
});

test('proof success requires every immutable record and production IDL comparison', () => {
  const matches = programs.map(matchingResult);
  assert.equal(proofMatches(matches), true);
  assert.equal(proofMatches(matches.map((result, index) => index === 2
    ? { ...result, record_verdict: 'DIFFER' }
    : result)), false);
  assert.equal(proofMatches(matches.map((result, index) => index === 4
    ? { ...result, production_idl_verdict: 'DIFFER' }
    : result)), false);
  assert.equal(proofMatches(matches.map((result, index) => index === 1
    ? { ...result, source_binary_verdict: 'DIFFER' }
    : result)), false);
});

test('known five-program source gaps do not fail an otherwise matching proof', async () => {
  const proof = await verifyPrograms({
    verifyProgramImpl: async (program) => matchingResult(program),
  });
  assert.equal(proof.ok, true);
  assert.equal(proof.comparison_completed, true);
  assert.equal(proof.summary.source_binary_matches, 1);
  assert.equal(proof.summary.known_source_binary_gaps, 5);
});

test('one program error does not prevent all six programs from being reported', async () => {
  const proof = await verifyPrograms({
    verifyProgramImpl: async (program) => {
      throw new Error(`${program.name} fixture proof error`);
    },
  });
  assert.equal(proof.ok, false);
  assert.equal(proof.comparison_completed, false);
  assert.equal(proof.results.length, 6);
  assert.equal(proof.summary.not_compared, 6);
  for (const [index, result] of proof.results.entries()) {
    assert.equal(result.program, programs[index].name);
    assert.equal(result.record_verdict, 'NOT_COMPARED');
    assert.equal(result.production_idl_verdict, 'NOT_COMPARED');
    assert.equal(result.comparison_completed, false);
    assert.equal(result.error, `${programs[index].name} fixture proof error`);
  }
});

test('Program Metadata addresses use canonical seeds', () => {
  assert.equal(
    metadataAddress('HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C').toBase58(),
    '4zNAR5DGuWuUnEbwGb7FzEVUUCx2xKca2bmHCeVpjQCJ',
  );
});

test('Program Metadata decoder returns exact stored IDL bytes', () => {
  const program = programs[0];
  const canonical = readFileSync(new URL(`../${program.productionIdlPath}`, import.meta.url));
  const compressed = deflateSync(canonical);
  const data = Buffer.alloc(96 + compressed.length + 32);
  data[0] = 2;
  new PublicKey(program.programId).toBuffer().copy(data, 1);
  data[65] = 1;
  data[66] = 1;
  data.write('idl', 67, 'utf8');
  data[83] = 1;
  data[84] = 2;
  data[85] = 1;
  data[86] = 0;
  data.writeUInt32LE(compressed.length, 87);
  compressed.copy(data, 96);
  assert.deepEqual(decodeProgramMetadata(data, program.programId), canonical);
});

test('read-only RPC allowlist rejects mutation methods before fetch', async () => {
  let called = false;
  await assert.rejects(
    rpcCall('https://rpc.invalid', 'sendTransaction', [], {
      fetchImpl: async () => { called = true; },
    }),
    /not read-only allowlisted/u,
  );
  assert.equal(called, false);
});

test('HTTP 429 retries are bounded by maxAttempts', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(
    rpcCall('https://rpc.invalid', 'getAccountInfo', [], {
      maxAttempts: 4,
      fetchImpl: async () => { calls += 1; return response({ status: 429 }); },
      sleepImpl: async (delay) => { delays.push(delay); },
    }),
    /HTTP 429 on attempt 4\/4; bounded retry limit reached/u,
  );
  assert.equal(calls, 4);
  assert.deepEqual(delays, [1_000, 2_000, 4_000]);
});

test('JSON-RPC 429 retries are bounded and Retry-After is capped', async () => {
  let calls = 0;
  const delays = [];
  await assert.rejects(
    rpcCall('https://rpc.invalid', 'getAccountInfo', [], {
      maxAttempts: 3,
      maxDelayMs: 8_000,
      fetchImpl: async () => {
        calls += 1;
        return response({
          retryAfter: '60',
          payload: { jsonrpc: '2.0', id: 1, error: { code: 429, message: 'rate limited' } },
        });
      },
      sleepImpl: async (delay) => { delays.push(delay); },
    }),
    /JSON-RPC 429 on attempt 3\/3; bounded retry limit reached/u,
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [8_000, 8_000]);
});

test('bounded retry returns successful read after transient 429 responses', async () => {
  let calls = 0;
  const result = await rpcCall('https://rpc.invalid', 'getAccountInfo', [], {
    maxAttempts: 4,
    fetchImpl: async () => {
      calls += 1;
      return calls < 3 ? response({ status: 429 }) : response({ payload: {
        jsonrpc: '2.0', id: 1, result: { value: 'read-only-proof' },
      } });
    },
    sleepImpl: async () => {},
  });
  assert.equal(calls, 3);
  assert.deepEqual(result, { value: 'read-only-proof' });
});

test('nightly preserves proof artifacts before enforcing comparison outcome', () => {
  assert.match(workflow, /id: compare[\s\S]*continue-on-error: true/u);
  assert.match(workflow, /Upload six-program read-only proof\n\s+if: always\(\)/u);
  assert.match(workflow, /docs\/v3-deployed-truth\.json/u);
  assert.match(workflow, /idls\/v3\/mainnet\/\*\.json/u);
  assert.match(workflow, /Enforce completed drift-free proof[\s\S]*COMPARE_OUTCOME/u);
  assert.match(workflow, /fetch-depth: 0/u);
  assert.match(workflow, /build-verify-escrow-v3-deployed-source\.sh/u);
  assert.match(workflow, /program-crate-tests:[\s\S]*for manifest in programs\/\*\/Cargo\.toml/u);
  assert.match(buildScript, /known source\n# gaps as failures/u);
  assert.doesNotMatch(buildScript, /cargo build-sbf/u);
  assert.match(workflow, /permissions:\n  contents: read/u);
  assert.doesNotMatch(workflow, /solana\s+(program\s+deploy|transfer|airdrop|balance)|anchor\s+(deploy|upgrade|idl\s+(init|upgrade|write-buffer|set-authority))/u);
});

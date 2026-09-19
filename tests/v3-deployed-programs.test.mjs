import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { PublicKey } from '@solana/web3.js';
import {
  decodeProgramMetadata,
  metadataAddress,
  proofMatches,
  programs,
  rpcCall,
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

function response({ status = 200, payload = { jsonrpc: '2.0', id: 1, result: {} }, retryAfter } = {}) {
  return {
    status,
    statusText: status === 429 ? 'Too Many Requests' : 'OK',
    ok: status >= 200 && status < 300,
    headers: { get: (name) => name === 'retry-after' ? retryAfter ?? null : null },
    json: async () => payload,
  };
}

test('proof covers exactly the six canonical V3 mainnet programs', () => {
  assert.deepEqual(programs.map(({ name }) => name), [
    'attestations_v3',
    'escrow_v3',
    'identity_v3',
    'reputation_v3',
    'reviews_v3',
    'validation_v3',
  ]);
  const anchor = readFileSync(new URL('../Anchor.toml', import.meta.url), 'utf8');
  for (const program of programs) {
    assert.match(anchor, new RegExp(`${program.name} = "${program.programId}"`, 'u'));
    const idl = JSON.parse(readFileSync(new URL(`../${program.idlPath}`, import.meta.url)));
    assert.equal(idl.metadata.deployments.mainnet, program.programId);
    assert.match(buildScript, new RegExp(`\\n  ${program.name}\\n`, 'u'));
  }
});

test('proof success requires every binary and IDL comparison to match', () => {
  const matches = programs.map(() => ({
    comparison_completed: true,
    binary_verdict: 'MATCH',
    idl_verdict: 'MATCH',
  }));
  assert.equal(proofMatches(matches), true);
  assert.equal(proofMatches(matches.map((result, index) => index === 2
    ? { ...result, binary_verdict: 'DIFFER' }
    : result)), false);
  assert.equal(proofMatches(matches.map((result, index) => index === 4
    ? { ...result, idl_verdict: 'DIFFER' }
    : result)), false);
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
  assert.equal(proof.summary.comparison_errors, 6);
  assert.equal(proof.summary.binary_not_compared, 6);
  assert.equal(proof.summary.idl_not_compared, 6);
  for (const [index, result] of proof.results.entries()) {
    assert.equal(result.program, programs[index].name);
    assert.equal(result.program_id, programs[index].programId);
    assert.equal(result.binary_verdict, 'NOT_COMPARED');
    assert.equal(result.idl_verdict, 'NOT_COMPARED');
    assert.equal(result.comparison_completed, false);
    assert.equal(result.error, `${programs[index].name} fixture proof error`);
  }
});

test('Program Metadata addresses use the canonical program/empty-authority/idl seeds', () => {
  assert.equal(
    metadataAddress('HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C').toBase58(),
    '4zNAR5DGuWuUnEbwGb7FzEVUUCx2xKca2bmHCeVpjQCJ',
  );
});

test('Program Metadata decoder returns the exact stored IDL bytes', () => {
  const program = programs[0];
  const canonical = readFileSync(new URL(`../${program.idlPath}`, import.meta.url));
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

test('read-only RPC allowlist rejects transaction and mutation methods before fetch', async () => {
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

test('bounded retry returns a successful read after transient 429 responses', async () => {
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

test('workflow has one six-program proof job and one all-program-crates cargo-test job', () => {
  assert.match(workflow, /deployed-source-proof:[\s\S]*build-verify-v3-deployed-programs\.sh/u);
  assert.match(workflow, /fetch-depth: 0/u);
  assert.match(workflow, /build-verify-escrow-v3-deployed-source\.sh/u);
  assert.match(workflow, /docs\/escrow-v3-deployed-truth\.json/u);
  assert.match(workflow, /program-crate-tests:[\s\S]*for manifest in programs\/\*\/Cargo\.toml/u);
  assert.match(workflow, /cargo \+1\.89\.0 test --locked --manifest-path "\$manifest" --all-targets/u);
  assert.match(workflow, /permissions:\n  contents: read/u);
  assert.doesNotMatch(workflow, /solana\s+(program\s+deploy|transfer|airdrop|balance)|anchor\s+(deploy|upgrade|idl\s+(init|upgrade|write-buffer|set-authority))/u);
});

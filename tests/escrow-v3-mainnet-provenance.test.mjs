import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateProvenanceManifest } from '../scripts/verify-escrow-v3-mainnet-provenance.mjs';

const manifest = JSON.parse(readFileSync(
  new URL('../docs/escrow-v3-mainnet-provenance-ef7e4581.json', import.meta.url),
  'utf8'
));

const mutate = (callback) => {
  const copy = structuredClone(manifest);
  callback(copy);
  return copy;
};

test('accepts the superseded historical fail-closed provenance gap packet', () => {
  assert.equal(validateProvenanceManifest(manifest), true);
});

test('rejects a false source/deployed/IDL certification', () => {
  assert.throws(() => validateProvenanceManifest(mutate((copy) => {
    copy.conclusion.source_equals_deployed_binary_equals_published_idl = true;
  })), /certification must fail closed/);
});

test('rejects a recertification that claims runtime drift', () => {
  assert.throws(() => validateProvenanceManifest(mutate((copy) => {
    copy.recertification.runtime_drift = true;
  })), /runtime drift must fail closed/);
});

test('rejects a missing recertification RPC slot', () => {
  assert.throws(() => validateProvenanceManifest(mutate((copy) => {
    delete copy.recertification.rpc_slot;
  })), /rpc_slot must be a positive integer/);
});

test('rejects an invented authoritative source commit', () => {
  assert.throws(() => validateProvenanceManifest(mutate((copy) => {
    copy.conclusion.authoritative_source_commit = copy.closest_satp_candidate.commit;
  })), /authoritative source commit must stay null/);
});

test('rejects missing build command or toolchain evidence', () => {
  assert.throws(() => validateProvenanceManifest(mutate((copy) => {
    delete copy.build_attempts[0].command;
  })), /every build attempt must name/);
});

test('rejects omission of a tested SATP feature profile', () => {
  assert.throws(() => validateProvenanceManifest(mutate((copy) => {
    const mainnetAttempt = copy.build_attempts.find((attempt) =>
      attempt.repository === 'brainAI-bot/satp' && attempt.features?.includes('mainnet'));
    mainnetAttempt.features = ['unrecorded-profile'];
  })), /default, mainnet, and devnet/);
});

test('rejects omission of a searched source repository', () => {
  assert.throws(() => validateProvenanceManifest(mutate((copy) => {
    copy.repository_searches = copy.repository_searches.filter((entry) =>
      entry.repository !== 'brainAI-bot/clawd-brainchain');
  })), /must cover SATP, AgentFolio, and clawd-brainchain/);
});

test('rejects the stale published IDL being labeled as 14 instructions', () => {
  assert.throws(() => validateProvenanceManifest(mutate((copy) => {
    copy.published_idl.instruction_count = 14;
  })), /instruction count must match its names/);
});

test('rejects mutation-authorizing safety evidence', () => {
  assert.throws(() => validateProvenanceManifest(mutate((copy) => {
    copy.safety.solana_write = true;
  })), /mutation safety flags must remain false/);
});

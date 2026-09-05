import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateDeployedTruth } from '../scripts/verify-escrow-v3-deployed-truth.mjs';

const manifest = JSON.parse(readFileSync(
  new URL('../docs/escrow-v3-deployed-truth.json', import.meta.url),
  'utf8'
));

const mutate = (callback) => {
  const copy = structuredClone(manifest);
  callback(copy);
  return copy;
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('accepts verified deployed source with Program Metadata account-schema fail closed', () => {
  assert.equal(validateDeployedTruth(manifest), true);
});

test('keeps the canonical IDL proof pinned to a reachable external commit', () => {
  assert.equal(
    manifest.canonical_idl.recorded_commit_reachability,
    'reachable_mainline_ancestor'
  );
  assert.equal(
    manifest.canonical_idl.recorded_at_commit,
    '614881a2971c924cd06cde9d9dfadaaf292f233d'
  );
  const recordedBytes = execFileSync('git', [
    'show',
    `${manifest.canonical_idl.recorded_at_commit}:${manifest.canonical_idl.path}`,
  ]);
  const canonicalBytes = readFileSync(new URL(`../${manifest.canonical_idl.path}`, import.meta.url));
  assert.equal(sha256(recordedBytes), manifest.canonical_idl.sha256);
  assert.deepEqual(recordedBytes, canonicalBytes);
});

test('rejects a fake canonical IDL provenance commit', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.canonical_idl.recorded_at_commit = 'f'.repeat(40);
  })), /recorded_at_commit must resolve to a commit/);
});

test('rejects the current tree as the canonical IDL provenance commit', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD']).toString('utf8').trim();
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.canonical_idl.recorded_at_commit = head;
  })), /must be an external commit/);
});

test('rejects a source artifact hash that differs from deployed payload', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.verified_source.artifact_sha256 = '0'.repeat(64);
  })), /artifact hash must equal deployed/);
});

test('rejects treating Program Metadata as canonical while fee-routing accounts differ', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program_metadata_idl.status = 'canonical_anchor_1_0_program_metadata';
    copy.program_metadata_idl.canonical_read_path = true;
    copy.conclusion.program_metadata_idl_is_canonical_anchor_1_0_read_path = true;
    copy.conclusion.published_program_metadata_is_canonical = true;
  })), /account-schema fail-closed state/);
});

test('rejects Program Metadata instruction drift from the verified-source IDL', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program_metadata_idl.instruction_names = copy.program_metadata_idl.instruction_names
      .filter((name) => name !== 'release_usdc');
    copy.program_metadata_idl.instruction_count = copy.program_metadata_idl.instruction_names.length;
  })), /Program Metadata IDL must contain 14 instructions/);
});

test('rejects hiding the Program Metadata release treasury account delta', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program_metadata_idl.repo_idl_account_surface_delta.release = [];
  })), /recorded account delta drifted/);
});

test('rejects claiming Program Metadata fee-routing schemas match the repo IDL', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.conclusion.program_metadata_fee_routing_account_schema_matches_canonical_repo_idl = true;
  })), /account schema mismatch must remain explicit/);
});

test('rejects treating the legacy Anchor IDL as canonical', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.conclusion.legacy_anchor_idl_is_canonical_read_path = true;
  })), /legacy Anchor IDL must not be represented as canonical/);
});

test('rejects hiding the deployed fee-routing runtime', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.conclusion.fee_routing_is_deployed = false;
  })), /deployed fee routing must remain explicit/);
});

test('rejects non-zero allocation padding claims', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program.allocation_padding_sha256 = '0'.repeat(64);
  })), /all-zero suffix hash/);
});

test('rejects opening consumers while product unpause remains gated', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.conclusion.consumer_escrow_unpause_ready = true;
  })), /consumer escrow must remain gated/);
});

test('rejects a mutation-authorizing packet', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.safety.solana_write = true;
  })), /mutation safety flags/);
});

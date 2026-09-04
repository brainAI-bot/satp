import assert from 'node:assert/strict';
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

test('accepts verified deployed source with Program Metadata canonical and legacy Anchor stale', () => {
  assert.equal(validateDeployedTruth(manifest), true);
});

test('rejects a source artifact hash that differs from deployed payload', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.verified_source.artifact_sha256 = '0'.repeat(64);
  })), /artifact hash must equal deployed/);
});

test('rejects treating Program Metadata as stale after Anchor 1.0 publication is reconciled', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program_metadata_idl.status = 'stale_not_canonical';
  })), /canonical Anchor 1\.0 read path/);
});

test('rejects Program Metadata instruction drift from the verified-source IDL', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program_metadata_idl.instruction_names = copy.program_metadata_idl.instruction_names
      .filter((name) => name !== 'release_usdc');
    copy.program_metadata_idl.instruction_count = copy.program_metadata_idl.instruction_names.length;
  })), /Program Metadata IDL must contain 14 instructions/);
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

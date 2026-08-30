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

test('accepts verified deployed source with both published IDL surfaces stale', () => {
  assert.equal(validateDeployedTruth(manifest), true);
});

test('rejects a source artifact hash that differs from deployed payload', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.verified_source.artifact_sha256 = '0'.repeat(64);
  })), /artifact hash must equal deployed/);
});

test('rejects treating Program Metadata as canonical before fee-routing accounts are published', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program_metadata_idl.status = 'canonical';
  })), /must remain explicitly stale/);
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

test('rejects opening consumers while canonical publication remains stale', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.conclusion.consumer_escrow_unpause_ready = true;
  })), /consumer escrow must remain gated/);
});

test('rejects a mutation-authorizing packet', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.safety.solana_write = true;
  })), /mutation safety flags/);
});

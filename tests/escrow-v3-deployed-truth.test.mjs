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

test('accepts verified deployed source with separately stale published IDL', () => {
  assert.equal(validateDeployedTruth(manifest), true);
});

test('rejects a source artifact hash that differs from deployed payload', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.verified_source.artifact_sha256 = '0'.repeat(64);
  })), /artifact hash must equal deployed/);
});

test('rejects treating the nine-instruction published account as canonical', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.published_idl.status = 'canonical';
  })), /must remain explicitly stale/);
});

test('rejects claiming fee routing is deployed', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.conclusion.fee_routing_is_deployed = true;
  })), /must not be marked deployed/);
});

test('rejects dropping the owner-gated mainnet rider packet', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    delete copy.pending_source_head.rider_packet;
  })), /rider packet/);
});

test('rejects a mutation-authorizing packet', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.safety.solana_write = true;
  })), /mutation safety flags/);
});

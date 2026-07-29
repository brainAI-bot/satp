import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReference } from '../scripts/verify-escrow-v3-build-proof.mjs';

const validReference = {
  targets: [
    {
      gate: 'required',
      expected_verdict: 'MATCH',
      build_source_profile: 'default',
      build_source_declare_id: 'B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg',
    },
    {
      gate: 'evidence_only',
      build_source_profile: 'default',
      build_source_declare_id: 'B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg',
      canonical_source_profile: 'mainnet',
      canonical_source_declare_id: 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C',
    },
  ],
};

const withRequiredSourceMetadata = (target) => ({
  build_source_profile: 'default',
  build_source_declare_id: 'B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg',
  ...target,
});

test('accepts explicit required and evidence_only gates with a required target', () => {
  assert.doesNotThrow(() => validateReference(validReference));
});

test('rejects a missing gate instead of defaulting it', () => {
  assert.throws(
    () => validateReference({ targets: [withRequiredSourceMetadata({ expected_verdict: 'MATCH' })] }),
    /gate must be one of required\|evidence_only/
  );
});

test('rejects unknown gate values', () => {
  assert.throws(
    () => validateReference({ targets: [withRequiredSourceMetadata({ gate: 'requiredd', expected_verdict: 'MATCH' })] }),
    /gate must be one of required\|evidence_only/
  );
});

test('rejects references with no required target', () => {
  assert.throws(
    () => validateReference({ targets: [withRequiredSourceMetadata({ gate: 'evidence_only' })] }),
    /must include at least one required gate/
  );
});

test('rejects targets without explicit build source metadata', () => {
  assert.throws(
    () => validateReference({ targets: [{ gate: 'required', expected_verdict: 'MATCH' }] }),
    /build_source_profile must be a non-empty string/
  );
});

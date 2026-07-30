import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReference } from '../scripts/verify-escrow-v3-build-proof.mjs';

const validReference = {
  source_identity_gate: 'required',
  targets: [
    {
      gate: 'evidence_only',
      build_source_profile: 'devnet feature',
      build_source_cfg: 'feature = "devnet"',
      build_source_declare_id: 'B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg',
    },
    {
      gate: 'evidence_only',
      build_source_profile: 'devnet feature',
      build_source_cfg: 'feature = "devnet"',
      build_source_declare_id: 'B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg',
      canonical_source_path: 'programs/escrow_v3/src/lib.rs',
      canonical_source_profile: 'default',
      canonical_source_cfg: 'not(feature = "devnet")',
      canonical_source_declare_id: 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C',
    },
  ],
};

const withRequiredSourceMetadata = (target) => ({
  build_source_profile: 'default',
  build_source_declare_id: 'B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg',
  ...target,
});

test('accepts evidence_only chain targets with a required source identity gate', () => {
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

test('rejects unknown source identity gate values', () => {
  assert.throws(
    () => validateReference({
      source_identity_gate: 'optional',
      targets: [withRequiredSourceMetadata({ gate: 'evidence_only' })],
    }),
    /source_identity_gate must be required/
  );
});

test('rejects a required gate that expects mismatch', () => {
  assert.throws(
    () => validateReference({
      targets: [withRequiredSourceMetadata({ gate: 'required', expected_verdict: 'DIFFER' })],
    }),
    /required gate expected_verdict must be MATCH/
  );
});

test('rejects targets without explicit build source metadata', () => {
  assert.throws(
    () => validateReference({ targets: [{ gate: 'required', expected_verdict: 'MATCH' }] }),
    /build_source_profile must be a non-empty string/
  );
});

test('rejects canonical source metadata without a canonical source path', () => {
  assert.throws(
    () => validateReference({
      targets: [
        withRequiredSourceMetadata({
          gate: 'required',
          expected_verdict: 'MATCH',
          canonical_source_declare_id: 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C',
        }),
      ],
    }),
    /canonical_source_path is required/
  );
});

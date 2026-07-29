import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReference } from '../scripts/verify-escrow-v3-build-proof.mjs';

const validReference = {
  targets: [
    { gate: 'required', expected_verdict: 'MATCH' },
    { gate: 'evidence_only' },
  ],
};

test('accepts explicit required and evidence_only gates with a required target', () => {
  assert.doesNotThrow(() => validateReference(validReference));
});

test('rejects a missing gate instead of defaulting it', () => {
  assert.throws(
    () => validateReference({ targets: [{ expected_verdict: 'MATCH' }] }),
    /gate must be one of required\|evidence_only/
  );
});

test('rejects unknown gate values', () => {
  assert.throws(
    () => validateReference({ targets: [{ gate: 'requiredd', expected_verdict: 'MATCH' }] }),
    /gate must be one of required\|evidence_only/
  );
});

test('rejects references with no required target', () => {
  assert.throws(
    () => validateReference({ targets: [{ gate: 'evidence_only' }] }),
    /must include at least one required gate/
  );
});

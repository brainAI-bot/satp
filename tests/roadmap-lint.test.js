const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { lintRoadmap } = require('../scripts/lint-roadmap');

const repoRoot = path.resolve(__dirname, '..');
const fixture = (name) => path.join(repoRoot, 'tests', 'fixtures', 'roadmap-lint', name);

test('current roadmap passes path and deployed-truth checks', () => {
  assert.deepEqual(lintRoadmap(path.join(repoRoot, 'ROADMAP.md'), { repoRoot }), []);
});

test('rejects a cited repository path that does not exist', () => {
  const errors = lintRoadmap(fixture('nonexistent-path.md'), { repoRoot });
  assert.ok(errors.includes('cited repository path does not exist: docs/definitely-not-a-real-satp-path.md'));
});

test('rejects a blocked bullet that contradicts a conclusion field', () => {
  const errors = lintRoadmap(fixture('blocked-truth-contradiction.md'), { repoRoot });
  assert.ok(errors.some((error) => error.includes(
    'blocked roadmap item contradicts deployed truth: docs/escrow-v3-deployed-truth.json#conclusion.fee_routing_is_deployed is true, cited as false'
  )));
});

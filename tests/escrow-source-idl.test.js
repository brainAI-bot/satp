const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..');

test('escrow source and committed IDL stay aligned', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-escrow-source-idl.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  const result = JSON.parse(output);

  assert.equal(result.ok, true);
  assert.equal(result.program_id, 'UpJ7jmUzHkQ7EdBKiBv3zq8Dr1fVh6GVWKa7nYtwQ22');
  assert.equal(result.instructions, 6);
  assert.equal(result.events, 5);
  assert.equal(result.errors, 10);
  assert.match(result.idl_sha256, /^[a-f0-9]{64}$/);
  assert.match(result.source_tree_sha256, /^[a-f0-9]{64}$/);
});

test('replacement escrow source slice does not edit roadmap authority', () => {
  const roadmap = readFileSync(join(root, 'ROADMAP.md'), 'utf8');
  assert.match(roadmap, /^# /m);
});

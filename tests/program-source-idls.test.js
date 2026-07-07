const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..');

test('all SATP V3 program sources stay aligned with committed IDLs', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-program-source-idls.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  const result = JSON.parse(output);

  assert.equal(result.ok, true);
  assert.equal(result.programs.length, 6);
  assert.deepEqual(
    result.programs.map((program) => program.program).sort(),
    [
      'attestations',
      'identity_registry',
      'reputation',
      'reviews',
      'satp_escrow',
      'validation',
    ],
  );

  for (const program of result.programs) {
    assert.match(program.idl_sha256, /^[a-f0-9]{64}$/);
    assert.match(program.source_sha256, /^[a-f0-9]{64}$/);
    assert.ok(program.instructions >= 1);
    assert.ok(program.accounts >= 1);
  }
});

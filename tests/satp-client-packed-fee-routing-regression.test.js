#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixture = path.join(repoRoot, 'tests/fixtures/brainai-satp-client-2.0.8.tgz');
const fixtureSha256 = '8fff1bb9959035d95d9242c8befbd4a912dd3a22da09ddd0f000692917c9e845';
const verifier = path.join(repoRoot, 'scripts/verify-satp-client-packed-fee-routing.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satp-client-208-regression-'));

try {
  const actualSha256 = crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
  assert.equal(actualSha256, fixtureSha256, 'published 2.0.8 fixture checksum changed');

  execFileSync('tar', ['-xzf', fixture, '-C', tempRoot], { stdio: 'pipe' });
  const packageRoot = path.join(tempRoot, 'package');
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.name, '@brainai/satp-client');
  assert.equal(packageJson.version, '2.0.8');

  const result = spawnSync(process.execPath, [verifier, packageRoot], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_PATH: path.join(repoRoot, 'node_modules'),
    },
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert.notEqual(result.status, 0, 'published 2.0.8 three-account builders must fail the verifier');
  assert.match(output, /release must include exactly four accounts/);

  console.log('satp-client 2.0.8 regression OK: published three-account release builder is rejected');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

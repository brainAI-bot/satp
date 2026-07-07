#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const clientRoot = path.join(repoRoot, 'packages/satp-client');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satp-client-packed-consumer-'));

try {
  const packOutput = execFileSync('npm', ['pack', clientRoot, '--pack-destination', tempRoot], {
    cwd: tempRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const tarball = path.join(tempRoot, packOutput.split('\n').pop());

  fs.writeFileSync(
    path.join(tempRoot, 'package.json'),
    JSON.stringify({
      name: 'satp-client-packed-consumer-smoke',
      private: true,
      version: '0.0.0',
      dependencies: {},
    }, null, 2) + '\n',
  );

  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: tempRoot,
    stdio: 'pipe',
  });

  const check = [
    "const satp = require('@brainai/satp-client');",
    "const resolved = require.resolve('@brainai/satp-client');",
    "if (!resolved.includes('node_modules')) throw new Error('package did not resolve from clean consumer node_modules');",
    "const required = ['BorshReader', 'DISCRIMINATORS', 'getAccountDiscriminator', 'isAccountType'];",
    "const missing = required.filter((key) => !(key in satp));",
    "if (missing.length) throw new Error('missing Borsh/discriminator exports: ' + missing.join(', '));",
    "const genesis = satp.getAccountDiscriminator('GenesisRecord');",
    "if (!Buffer.isBuffer(genesis) || genesis.toString('hex') !== '16a0f570b27eb16a') throw new Error('GenesisRecord discriminator mismatch');",
    "if (!satp.DISCRIMINATORS.GenesisRecord.equals(genesis)) throw new Error('DISCRIMINATORS export mismatch');",
    "if (!satp.isAccountType(Buffer.concat([genesis, Buffer.from([0])]), 'GenesisRecord')) throw new Error('isAccountType failed for generated discriminator');",
    "const reader = new satp.BorshReader(Buffer.from([7]));",
    "if (reader.readU8() !== 7) throw new Error('BorshReader export smoke failed');",
    "console.log('satp-client packed consumer OK: ' + resolved);",
  ].join('\n');

  const output = execFileSync(process.execPath, ['-e', check], {
    cwd: tempRoot,
    encoding: 'utf8',
  });
  process.stdout.write(output);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

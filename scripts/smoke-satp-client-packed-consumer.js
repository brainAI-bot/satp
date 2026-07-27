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
    "const v3Mainnet = satp.getV3ProgramIds('mainnet');",
    "if (!satp.V3_MAINNET_PROGRAM_IDS) throw new Error('V3_MAINNET_PROGRAM_IDS export is null or missing');",
    "if (v3Mainnet !== satp.V3_MAINNET_PROGRAM_IDS) throw new Error('getV3ProgramIds(mainnet) did not return V3_MAINNET_PROGRAM_IDS');",
    "if (v3Mainnet.IDENTITY.toBase58() !== 'GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG') throw new Error('V3 mainnet identity program ID mismatch');",
    "const walletControl = require('@brainai/satp-client/wallet-control-challenge');",
    "const walletControlResolved = require.resolve('@brainai/satp-client/wallet-control-challenge');",
    "if (!walletControlResolved.includes('node_modules')) throw new Error('wallet-control subpath did not resolve from clean consumer node_modules');",
    "for (const key of ['buildWalletControlChallenge', 'canonicalWalletControlChallenge', 'hashWalletControlChallenge', 'deriveWalletControlChallengePdas', 'verifyWalletControlChallengeSignature']) {",
    "  if (typeof walletControl[key] !== 'function') throw new Error('missing wallet-control subpath export: ' + key);",
    "}",
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

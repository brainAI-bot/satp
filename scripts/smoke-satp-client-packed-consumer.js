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
      overrides: {
        jayson: {
          uuid: '^11.1.1',
        },
      },
    }, null, 2) + '\n',
  );

  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: tempRoot,
    stdio: 'pipe',
  });
  execFileSync('npm', ['audit', '--omit=dev', '--audit-level=moderate'], {
    cwd: tempRoot,
    stdio: 'pipe',
  });

  const installedPackageRoot = path.join(
    tempRoot,
    'node_modules',
    '@brainai',
    'satp-client',
  );
  const installedPackage = JSON.parse(fs.readFileSync(
    path.join(installedPackageRoot, 'package.json'),
    'utf8',
  ));
  const installedReadme = fs.readFileSync(
    path.join(installedPackageRoot, 'README.md'),
    'utf8',
  );

  const stableBanner = `Current stable npm package: **@brainai/satp-client@${installedPackage.version}**`;
  const stableInstall = `npm install @brainai/satp-client@${installedPackage.version}`;
  if (!installedReadme.includes(stableBanner)) {
    throw new Error(`packed README stable banner does not match ${installedPackage.version}`);
  }
  if (!installedReadme.includes(stableInstall)) {
    throw new Error(`packed README install command does not match ${installedPackage.version}`);
  }
  if (!installedReadme.includes('[Quick Start](#quick-start)')) {
    throw new Error('packed README quickstart link does not resolve inside README.md');
  }
  if (installedReadme.includes('../../docs/')) {
    throw new Error('packed README contains repository-relative docs paths');
  }

  const bashBlocks = [];
  let activeFence = null;
  for (const line of installedReadme.split(/\r?\n/)) {
    if (activeFence === null) {
      const opener = line.match(/^```([^\s`]*)\s*$/);
      if (opener) {
        activeFence = { language: opener[1].toLowerCase(), lines: [] };
      }
      continue;
    }
    if (/^```\s*$/.test(line)) {
      if (['bash', 'sh', 'shell'].includes(activeFence.language)) {
        bashBlocks.push(activeFence.lines);
      }
      activeFence = null;
      continue;
    }
    activeFence.lines.push(line);
  }

  const documentedNodeTargets = new Set();
  const nodeInvocation = /(?:^|(?:&&|\|\||;)\s*)node\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|#]+))/g;
  for (const lines of bashBlocks) {
    for (const line of lines) {
      if (line.trimStart().startsWith('#')) continue;
      nodeInvocation.lastIndex = 0;
      for (const match of line.matchAll(nodeInvocation)) {
        documentedNodeTargets.add(match[1] || match[2] || match[3]);
      }
    }
  }
  if (documentedNodeTargets.size === 0) {
    throw new Error('packed README contains no discoverable node commands in bash fences');
  }

  const documentedExampleLinks = new Set();
  const exampleLink = /\]\((?:\.\/)?(examples\/[^)\s#?]+)\)/g;
  for (const match of installedReadme.matchAll(exampleLink)) {
    documentedExampleLinks.add(match[1]);
  }
  if (documentedExampleLinks.size === 0) {
    throw new Error('packed README contains no discoverable example links');
  }

  const commandedPackagePaths = new Set();
  for (const target of documentedNodeTargets) {
    const installedTarget = path.resolve(tempRoot, target);
    const packageRelative = path.relative(installedPackageRoot, installedTarget);
    if (
      packageRelative === ''
      || packageRelative === '..'
      || packageRelative.startsWith(`..${path.sep}`)
      || path.isAbsolute(packageRelative)
    ) {
      throw new Error(`packed README node command escapes installed package: ${target}`);
    }
    if (!fs.statSync(installedTarget, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`packed README node command target missing from artifact: ${target}`);
    }
    const packagePath = packageRelative.split(path.sep).join('/');
    commandedPackagePaths.add(packagePath);
    execFileSync(process.execPath, [installedTarget], {
      cwd: tempRoot,
      stdio: 'pipe',
    });
  }

  for (const examplePath of documentedExampleLinks) {
    const installedExamplePath = path.resolve(installedPackageRoot, examplePath);
    const packageRelative = path.relative(installedPackageRoot, installedExamplePath);
    if (
      packageRelative === '..'
      || packageRelative.startsWith(`..${path.sep}`)
      || path.isAbsolute(packageRelative)
    ) {
      throw new Error(`packed README example link escapes installed package: ${examplePath}`);
    }
    if (!fs.statSync(installedExamplePath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`packed README example link missing from artifact: ${examplePath}`);
    }
    if (!commandedPackagePaths.has(examplePath)) {
      throw new Error(`packed README example link has no runnable node command: ${examplePath}`);
    }
  }

  for (const packagePath of commandedPackagePaths) {
    if (packagePath.startsWith('examples/') && !documentedExampleLinks.has(packagePath)) {
      throw new Error(`packed README node example has no matching link: ${packagePath}`);
    }
  }

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
  console.log(
    `satp-client packed README OK: ${installedPackage.version}; ${documentedExampleLinks.size} documented examples discovered and executed`,
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

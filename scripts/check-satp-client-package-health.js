#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const packageDir = path.join(repoRoot, 'packages/satp-client');

function rel(target) {
  return path.relative(repoRoot, target) || '.';
}

function run(command, args, options = {}) {
  const cwd = options.cwd || repoRoot;
  const label = `${rel(cwd)}$ ${[command, ...args].join(' ')}`;
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });

  if (result.stdout && !options.quiet) process.stdout.write(result.stdout);
  if (result.stderr && !options.quiet) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${label} exited ${result.status}`);
  }
  return result;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not return valid JSON: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readPackageMetadata() {
  const result = run('npm', [
    '--prefix',
    rel(packageDir),
    'pkg',
    'get',
    'name',
    'version',
    'main',
    'types',
    'exports',
    'files',
    'bundleDependencies',
    'private',
    'publishConfig',
    '--json',
  ]);
  const metadata = parseJson(result.stdout, 'npm package metadata readback');

  assert(metadata.name === '@brainai/satp-client', 'package name must remain @brainai/satp-client');
  assert(metadata.private === false, 'satp-client package must not be private');
  assert(metadata.main === 'src/index.js', 'main must point at src/index.js');
  assert(metadata.types === 'src/index.d.ts', 'types must point at src/index.d.ts');
  assert(metadata.exports && metadata.exports['.'], 'root export must be declared');
  assert(metadata.exports['./wallet-control-challenge'], 'wallet-control subpath export must be declared');
  assert(metadata.exports['./x402-discovery'], 'x402-discovery subpath export must be declared');
  assert(Array.isArray(metadata.files) && metadata.files.includes('src/'), 'files must include src/');
  const bundled = Array.isArray(metadata.bundleDependencies)
    ? metadata.bundleDependencies
    : [metadata.bundleDependencies];
  assert(
    bundled.length === 1 && bundled[0] === '@solana/web3.js',
    'bundleDependencies must contain only the temporary @solana/web3.js safety bundle',
  );
  assert(metadata.publishConfig && metadata.publishConfig.access === 'public', 'publishConfig.access must remain public');
  assert(!('tag' in metadata.publishConfig), 'stable package metadata must not force the rc dist-tag');
}

function auditProductionDependencies() {
  const result = run('npm', ['audit', '--omit=dev', '--json'], {
    cwd: packageDir,
    allowFailure: true,
  });
  const audit = parseJson(result.stdout, 'npm audit --omit=dev');
  const vulnerabilities = audit.metadata && audit.metadata.vulnerabilities;
  const total = vulnerabilities ? vulnerabilities.total : undefined;
  assert(total === 0, `npm audit --omit=dev found ${total} vulnerabilities`);
  assert(result.status === 0, `npm audit --omit=dev exited ${result.status} despite zero vulnerabilities`);
}

function readPackSurface() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'satp-client-health-pack-'));
  let filePaths;
  try {
    const result = run('npm', ['pack', '--silent', '--json', '--pack-destination', tempDir, '.'], {
      cwd: packageDir,
      quiet: true,
    });
    const pack = parseJson(result.stdout, 'npm pack');
    assert(Array.isArray(pack) && pack.length === 1, 'npm pack must return one package');

    const tarballPath = path.join(tempDir, pack[0].filename);
    assert(fs.existsSync(tarballPath), `npm pack did not create ${pack[0].filename}`);
    const archive = run('tar', ['-tzf', tarballPath], { quiet: true });
    const archivePaths = archive.stdout.split(/\r?\n/).filter(Boolean);
    assert(
      archivePaths.includes('package/node_modules/@solana/web3.js/package.json'),
      'pack artifact must include the temporary @solana/web3.js safety bundle',
    );

    const files = pack[0].files || [];
    filePaths = files.map((file) => file.path).sort();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  for (const required of [
    'package.json',
    'README.md',
    'src/index.js',
    'src/index.d.ts',
    'src/wallet-control-challenge.js',
    'src/x402-discovery.js',
  ]) {
    assert(filePaths.includes(required), `pack surface missing ${required}`);
  }

  for (const blocked of [
    'package-lock.json',
    '.env',
    'test.js',
    'test-release-safety.js',
  ]) {
    assert(!filePaths.includes(blocked), `pack surface includes blocked file ${blocked}`);
  }

  console.log(`pack surface OK: ${filePaths.length} package files; @solana/web3.js bundle verified from tarball`);
  return filePaths;
}

function smokeRequireImportExports() {
  const smokeSource = `
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const { pathToFileURL } = require('node:url');
    const packageDir = ${JSON.stringify(packageDir)};
    async function main() {
      const satp = require(path.join(packageDir, 'src'));
      const wallet = require(path.join(packageDir, 'src/wallet-control-challenge.js'));
      const x402 = require(path.join(packageDir, 'src/x402-discovery.js'));
      for (const key of ['SATPV3SDK', 'createSATPClient', 'buildSatpTrustPacket', 'evaluateRuntimePolicy']) {
        assert.equal(typeof satp[key], 'function', key + ' root export must be a function');
      }
      assert.equal(typeof wallet.buildWalletControlChallenge, 'function');
      assert.equal(typeof x402.parseX402DiscoveryMetadata, 'function');
      const imported = await import(pathToFileURL(path.join(packageDir, 'src/index.js')).href);
      assert.equal(typeof imported.default.createSATPClient, 'function');
      assert.equal(typeof imported.default.buildWalletControlChallenge, 'function');
      console.log('require/import/export smoke OK');
    }
    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;
  const smokePath = path.join(os.tmpdir(), `satp-client-health-smoke-${process.pid}.cjs`);
  fs.writeFileSync(smokePath, smokeSource);
  try {
    run(process.execPath, [smokePath]);
  } finally {
    fs.rmSync(smokePath, { force: true });
  }
}

function scanPackedFilesForSecretShapes(filePaths) {
  const secretPatterns = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key PEM block'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
    [/\bgh[pousr]_[A-Za-z0-9_]{30,}\b/, 'GitHub token'],
    [/\bnpm_[A-Za-z0-9]{30,}\b/, 'npm token'],
    [/\b(?:xox[baprs]-)[A-Za-z0-9-]{20,}\b/, 'Slack token'],
    [/\bsk-[A-Za-z0-9]{32,}\b/, 'OpenAI-style API key'],
    [/\b(?:SECRET|TOKEN|PRIVATE_KEY|API_KEY)\s*=\s*['"]?[A-Za-z0-9_./+=-]{16,}/, 'env-style secret assignment'],
  ];

  const findings = [];
  for (const packedPath of filePaths) {
    const absolutePath = path.join(packageDir, packedPath);
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile() || stat.size > 1024 * 1024) continue;
    const text = fs.readFileSync(absolutePath, 'utf8');
    for (const [pattern, label] of secretPatterns) {
      if (pattern.test(text)) findings.push(`${packedPath}: ${label}`);
    }
  }

  assert(findings.length === 0, `packed secret-shaped scan found ${findings.join('; ')}`);
  console.log(`packed secret-shaped scan OK: ${filePaths.length} files checked`);
}

readPackageMetadata();
auditProductionDependencies();
const packedFiles = readPackSurface();
smokeRequireImportExports();
scanPackedFilesForSecretShapes(packedFiles);

console.log('\nSATP client package health OK: metadata/audit/pack/smoke/secret-shape checks passed');

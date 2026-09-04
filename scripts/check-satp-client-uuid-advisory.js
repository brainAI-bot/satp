#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const clientRoot = path.join(repoRoot, 'packages/satp-client');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satp-client-uuid-advisory-'));
const fixedUuidVersion = '11.1.1';
const fixedStreamJsonVersion = '3.5.0';

function isVersionBefore(version, boundary) {
  const parse = (value) => {
    const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
    return match ? {
      parts: match.slice(1, 4).map(Number),
      prerelease: Boolean(match[4]),
    } : null;
  };
  const current = parse(version);
  const limit = parse(boundary);
  if (!current || !limit) return false;
  for (let i = 0; i < current.parts.length; i += 1) {
    if (current.parts[i] !== limit.parts[i]) return current.parts[i] < limit.parts[i];
  }
  return current.prerelease && !limit.prerelease;
}

function resolvePackageManifest(packageName, options) {
  let current = path.dirname(require.resolve(packageName, options));
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }
  throw new Error(`could not locate package manifest for ${packageName}`);
}

try {
  const packOutput = execFileSync('npm', ['pack', '.', '--silent', '--pack-destination', tempRoot], {
    cwd: clientRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const tarball = path.join(tempRoot, packOutput.split('\n').pop());

  fs.writeFileSync(
    path.join(tempRoot, 'package.json'),
    JSON.stringify({
      name: 'satp-client-uuid-advisory-monitor',
      private: true,
      version: '0.0.0',
      dependencies: {},
      overrides: {
        jayson: {
          'stream-json': '^3.6.0',
          uuid: `^${fixedUuidVersion}`,
        },
      },
    }, null, 2) + '\n',
  );

  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: tempRoot,
    stdio: 'pipe',
  });

  const installedPackageRoot = path.join(tempRoot, 'node_modules', '@brainai', 'satp-client');
  const web3ManifestPath = require.resolve('@solana/web3.js/package.json', {
    paths: [installedPackageRoot],
  });
  if (web3ManifestPath.startsWith(`${installedPackageRoot}${path.sep}node_modules${path.sep}`)) {
    throw new Error('packed client unexpectedly contains a bundled @solana/web3.js dependency tree');
  }
  const jaysonManifestPath = require.resolve('jayson/package.json', {
    paths: [path.dirname(web3ManifestPath)],
  });
  const uuidManifestPath = require.resolve('uuid/package.json', {
    paths: [path.dirname(jaysonManifestPath)],
  });
  const streamJsonManifestPath = resolvePackageManifest('stream-json', {
    paths: [path.dirname(jaysonManifestPath)],
  });
  const web3Version = JSON.parse(fs.readFileSync(web3ManifestPath, 'utf8')).version;
  const jaysonVersion = JSON.parse(fs.readFileSync(jaysonManifestPath, 'utf8')).version;
  const uuidVersion = JSON.parse(fs.readFileSync(uuidManifestPath, 'utf8')).version;
  const streamJsonVersion = JSON.parse(fs.readFileSync(streamJsonManifestPath, 'utf8')).version;
  const resolvedPath = [
    `@solana/web3.js@${web3Version}`,
    `jayson@${jaysonVersion}`,
    `uuid@${uuidVersion}`,
    `stream-json@${streamJsonVersion}`,
  ];
  if (isVersionBefore(uuidVersion, fixedUuidVersion)) {
    throw new Error(`consumer override failed: resolved affected uuid ${uuidVersion}`);
  }
  if (isVersionBefore(streamJsonVersion, fixedStreamJsonVersion)) {
    throw new Error(`consumer override failed: resolved affected stream-json ${streamJsonVersion}`);
  }

  const auditResult = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: tempRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (auditResult.error) {
    throw auditResult.error;
  }

  let audit;
  try {
    audit = JSON.parse(auditResult.stdout);
  } catch {
    const detail = auditResult.stderr.trim() || auditResult.stdout.trim() || 'no npm output';
    throw new Error(`npm audit did not return JSON: ${detail}`);
  }
  if (audit.error) {
    throw new Error(`npm audit failed: ${audit.error.code || 'unknown'} ${audit.error.summary || ''}`.trim());
  }
  const uuidFinding = audit.vulnerabilities?.uuid;
  const uuidAdvisory = uuidFinding?.via?.find(
    (finding) => typeof finding === 'object'
      && finding.url === 'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
  );
  if (uuidAdvisory) {
    throw new Error(
      `consumer override failed: GHSA-w5hq-g745-h8pq remains at uuid ${uuidVersion}`,
    );
  }
  const streamJsonFinding = audit.vulnerabilities?.['stream-json'];
  const streamJsonAdvisory = streamJsonFinding?.via?.find(
    (finding) => typeof finding === 'object'
      && finding.url === 'https://github.com/advisories/GHSA-528h-pc64-c93x',
  );
  if (streamJsonAdvisory) {
    throw new Error(
      `consumer override failed: GHSA-528h-pc64-c93x remains at stream-json ${streamJsonVersion}`,
    );
  }
  if (auditResult.status !== 0) {
    const vulnerabilityCount = audit.metadata?.vulnerabilities?.total;
    throw new Error(
      `npm audit exited ${auditResult.status}: vulnerabilities=${vulnerabilityCount ?? 'unknown'}; ${auditResult.stderr.trim() || 'no stderr'}`,
    );
  }

  console.log(
    `consumer transitive advisories remediated: ${resolvedPath.join(' -> ')}; npm audit vulnerabilities=0`,
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

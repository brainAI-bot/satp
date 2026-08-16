#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const clientRoot = path.join(repoRoot, 'packages/satp-client');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satp-client-uuid-advisory-'));

function dependencyAt(tree, names) {
  return names.reduce((node, name) => node?.dependencies?.[name], tree);
}

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
      name: 'satp-client-uuid-advisory-monitor',
      private: true,
      version: '0.0.0',
      dependencies: {},
    }, null, 2) + '\n',
  );

  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: tempRoot,
    stdio: 'pipe',
  });

  const dependencyTree = JSON.parse(execFileSync('npm', ['ls', 'uuid', '--json'], {
    cwd: tempRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const clientDependency = dependencyAt(dependencyTree, ['@brainai/satp-client']);
  if (!clientDependency) {
    throw new Error('packed @brainai/satp-client dependency is missing');
  }
  const upstreamPath = ['@solana/web3.js', 'jayson', 'uuid'];
  const resolvedPath = [];
  let dependency = clientDependency;
  for (const name of upstreamPath) {
    dependency = dependencyAt(dependency, [name]);
    if (!dependency?.version) {
      throw new Error(`upstream advisory path changed at ${name}: dependency missing; review the temporary override`);
    }
    resolvedPath.push(`${name}@${dependency.version}`);
  }
  const uuidVersion = dependency.version;
  if (!isVersionBefore(uuidVersion, '11.1.1')) {
    throw new Error(`upstream uuid ${uuidVersion} is outside the affected range; review/remove the temporary override`);
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
  if (auditResult.status !== 1) {
    throw new Error(
      auditResult.status === 0
        ? 'uuid advisory no longer reproduced; review/remove the temporary override and update issue #134'
        : `npm audit exited ${auditResult.status}: ${auditResult.stderr.trim() || 'no stderr'}`,
    );
  }

  const uuidFinding = audit.vulnerabilities?.uuid;
  if (!uuidFinding || uuidFinding.severity !== 'moderate' || uuidFinding.fixAvailable !== false) {
    throw new Error(
      `uuid advisory changed: severity=${uuidFinding?.severity || 'missing'}, fixAvailable=${JSON.stringify(uuidFinding?.fixAvailable)}`,
    );
  }

  const uuidAdvisory = uuidFinding.via.find(
    (finding) => typeof finding === 'object'
      && finding.url === 'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
  );
  if (!uuidAdvisory) {
    throw new Error('GHSA-w5hq-g745-h8pq is no longer present on the uuid finding');
  }

  console.log(
    `known uuid advisory confirmed: ${resolvedPath.join(' -> ')}; fixAvailable=false`,
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

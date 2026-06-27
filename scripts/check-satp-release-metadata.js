#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const packagePath = path.join(repoRoot, 'packages/satp-client/package.json');
const fixturePath = path.join(repoRoot, 'tests/fixtures/satp-client-release-metadata.json');
const dependentWorkspacePaths = [
  'packages/satp/package.json',
  'packages/satp-core/package.json',
  'packages/satp-solana/package.json',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  assert(match, `invalid semver version: ${version}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function compareCoreVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  return 0;
}

const pkg = readJson(packagePath);
const fixture = readJson(fixturePath);
const local = parseVersion(pkg.version);
const stable = parseVersion(fixture.stableLatest);

assert.equal(pkg.name, fixture.package, 'release metadata package name mismatch');
assert.equal(pkg.private, false, 'SATP client release candidate must be publishable');
assert.equal(pkg.publishConfig && pkg.publishConfig.tag, 'rc', 'release candidate must publish with rc dist-tag only');
assert.match(pkg.version, /-rc\.\d+$/, 'SATP client version must be an rc prerelease');
assert.equal(pkg.version, fixture.nextReleaseCandidate, 'local SATP client version must match reconciled RC fixture');
assert(compareCoreVersions(local, stable) > 0, `local RC ${pkg.version} must be newer than stable latest ${fixture.stableLatest}`);

for (const relativePath of dependentWorkspacePaths) {
  const workspacePackage = readJson(path.join(repoRoot, relativePath));
  assert.equal(
    workspacePackage.dependencies && workspacePackage.dependencies[pkg.name],
    pkg.version,
    `${relativePath} must depend on ${pkg.name}@${pkg.version}`
  );
}

console.log(`SATP release metadata OK: ${pkg.name}@${pkg.version} is newer than npm latest ${fixture.stableLatest}; publishConfig.tag=rc`);

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
const releaseTarget = fixture.nextReleaseCandidate || fixture.stableLatest;

assert.match(fixture.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, 'release metadata checkedAt must be an ISO UTC timestamp');
assert.equal(fixture.releasePullRequest, 164, 'SATP client 2.0.8 provenance must name release PR #164');
assert.equal(fixture.releaseMergeCommit, '250f59c792ff50e185163e4454f4d6982468151b', 'SATP client 2.0.8 provenance must name the reviewed merge commit');
assert.equal(fixture.publishedAt, '2026-08-29T18:06:11.408Z', 'SATP client 2.0.8 provenance must preserve the registry publish timestamp');
assert.equal(fixture.publishTask, 'TASK-09243114', 'SATP client 2.0.8 provenance must name the passed HQ publish task');

assert.equal(pkg.name, fixture.package, 'release metadata package name mismatch');
assert.equal(pkg.private, false, 'SATP client stable package must be publishable');
assert.equal(pkg.publishConfig && pkg.publishConfig.access, 'public', 'stable package must keep public package access');
assert.equal(pkg.publishConfig && pkg.publishConfig.tag, undefined, 'stable package must not force the rc dist-tag');
assert.equal(local.prerelease, '', 'SATP client stable version must not be an rc prerelease');
assert.equal(pkg.version, releaseTarget, 'local SATP client version must match release metadata target');

if (fixture.nextReleaseCandidate) {
  assert(
    compareCoreVersions(local, stable) > 0,
    `next release candidate ${pkg.version} must be newer than npm stable latest ${fixture.stableLatest}`
  );
} else {
  assert(compareCoreVersions(local, stable) === 0, `local stable ${pkg.version} must match stable latest ${fixture.stableLatest}`);
}

for (const relativePath of dependentWorkspacePaths) {
  const workspacePackage = readJson(path.join(repoRoot, relativePath));
  assert.equal(
    workspacePackage.dependencies && workspacePackage.dependencies[pkg.name],
    pkg.version,
    `${relativePath} must depend on ${pkg.name}@${pkg.version}`
  );
}

if (fixture.nextReleaseCandidate) {
  console.log(`SATP release metadata OK: ${pkg.name}@${pkg.version} is next source candidate above npm latest ${fixture.stableLatest}; publishConfig.access=public`);
} else {
  console.log(`SATP release metadata OK: ${pkg.name}@${pkg.version} matches npm latest ${fixture.stableLatest}; publishConfig.access=public`);
}

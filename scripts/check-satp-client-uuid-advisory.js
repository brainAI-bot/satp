#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const clientRoot = path.join(repoRoot, 'packages/satp-client');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satp-client-uuid-advisory-'));
const expectedVulnerabilities = [
  '@brainai/satp-client',
  '@solana/web3.js',
  'jayson',
  'uuid',
];

function dependencyAt(tree, names) {
  return names.reduce((node, name) => node?.dependencies?.[name], tree);
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
  const expectedPath = [
    ['@brainai/satp-client', '2.0.6'],
    ['@solana/web3.js', '1.98.4'],
    ['jayson', '4.3.0'],
    ['uuid', '8.3.2'],
  ];
  let dependency = dependencyTree;
  for (const [name, version] of expectedPath) {
    dependency = dependencyAt(dependency, [name]);
    if (dependency?.version !== version) {
      throw new Error(
        `upstream advisory path changed at ${name}: expected ${version}, got ${dependency?.version || 'missing'}; review the temporary override`,
      );
    }
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

  const actualVulnerabilities = Object.keys(audit.vulnerabilities || {}).sort();
  if (JSON.stringify(actualVulnerabilities) !== JSON.stringify(expectedVulnerabilities)) {
    throw new Error(
      `production advisory set changed: expected ${expectedVulnerabilities.join(', ')}, got ${actualVulnerabilities.join(', ') || 'none'}`,
    );
  }
  for (const name of expectedVulnerabilities) {
    const finding = audit.vulnerabilities[name];
    if (finding.severity !== 'moderate' || finding.fixAvailable !== false) {
      throw new Error(
        `${name} advisory changed: severity=${finding.severity}, fixAvailable=${JSON.stringify(finding.fixAvailable)}`,
      );
    }
  }

  const uuidAdvisory = audit.vulnerabilities.uuid.via.find(
    (finding) => typeof finding === 'object'
      && finding.url === 'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
  );
  if (!uuidAdvisory || uuidAdvisory.range !== '<11.1.1') {
    throw new Error('GHSA-w5hq-g745-h8pq range or identity changed');
  }
  const counts = audit.metadata?.vulnerabilities;
  if (counts?.moderate !== 4 || counts?.total !== 4) {
    throw new Error(
      `production advisory counts changed: moderate=${counts?.moderate}, total=${counts?.total}`,
    );
  }

  console.log(
    'known uuid advisory confirmed: @solana/web3.js@1.98.4 -> jayson@4.3.0 -> uuid@8.3.2; 4 moderate findings',
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

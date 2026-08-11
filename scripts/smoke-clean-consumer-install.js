#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satp-clean-consumer-'));

try {
  const packOutput = execFileSync('npm', ['pack', repoRoot, '--pack-destination', tempRoot], {
    cwd: tempRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const tarball = path.join(tempRoot, packOutput.split('\n').pop());

  const packageJson = {
    name: 'satp-clean-consumer-smoke',
    private: true,
    version: '0.0.0',
    dependencies: {},
    overrides: {
      jayson: {
        uuid: '^11.1.1',
      },
    },
  };

  fs.writeFileSync(
    path.join(tempRoot, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n',
  );

  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: tempRoot,
    stdio: 'pipe',
  });
  execFileSync('npm', ['audit', '--omit=dev', '--audit-level=moderate'], {
    cwd: tempRoot,
    stdio: 'pipe',
  });

  const check = [
    "const satp = require('@brainai/satp-client');",
    "const required = ['SATPSDK', 'SATPV3SDK', 'createSATPClient', 'getV3ProgramIds', 'hashAgentId', 'getGenesisPDA', 'prepareIdentityAttestationRequest', 'evaluateRuntimePolicy'];",
    "const missing = required.filter((key) => !(key in satp));",
    "if (missing.length) throw new Error('missing exports: ' + missing.join(', '));",
    "const resolved = require.resolve('@brainai/satp-client');",
    "if (!resolved.includes('node_modules')) throw new Error('package did not resolve from clean consumer node_modules');",
    "const decision = satp.evaluateRuntimePolicy({ active: true, satpVerified: true, agentFolioTrustScore: 90, capabilities: ['mcp:read'], evidenceUpdatedAt: '2026-05-21T00:00:00Z' }, { type: 'mcp_protected_tool', requiresCapability: 'mcp:read', requiresFreshEvidence: true }, { now: '2026-05-22T00:00:00Z' });",
    "if (decision.decision !== 'allow') throw new Error('runtime policy export smoke failed: ' + decision.decision);",
    "console.log('clean consumer install OK: ' + resolved);",
  ].join('\n');

  const output = execFileSync(process.execPath, ['-e', check], {
    cwd: tempRoot,
    encoding: 'utf8',
  });
  process.stdout.write(output);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

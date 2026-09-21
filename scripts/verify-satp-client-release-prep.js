#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const repoRoot = path.resolve(__dirname, '..');
const packagePath = path.join(repoRoot, 'packages/satp-client/package.json');

function fail(message) {
  throw new Error(message);
}

function parseJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function exportTargets(exportsValue) {
  if (typeof exportsValue === 'string') return [exportsValue];
  if (!exportsValue || typeof exportsValue !== 'object') return [];
  return Object.values(exportsValue).flatMap((value) => exportTargets(value));
}

function globPatternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replaceAll('*', '.+')}$`);
}

function verifyExportTargets(packageJson, files) {
  const packedPaths = new Set(files.map((file) => file.path));
  const missing = [];

  for (const [exportPath, exportValue] of Object.entries(packageJson.exports || {})) {
    const targets = [...new Set(exportTargets(exportValue))];
    if (targets.length === 0) missing.push(`${exportPath} has no runtime target`);
    for (const target of targets) {
      const normalized = target.replace(/^\.\//, '');
      if (normalized.includes('*')) {
        const matcher = globPatternToRegExp(normalized);
        if (![...packedPaths].some((packedPath) => matcher.test(packedPath))) {
          missing.push(`${exportPath} -> ${target}`);
        }
      } else if (!packedPaths.has(normalized)) {
        missing.push(`${exportPath} -> ${target}`);
      }
    }
  }

  if (missing.length > 0) {
    fail(`npm pack file list is missing export targets: ${missing.join(', ')}`);
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      'pack-json': { type: 'string' },
      version: { type: 'string' },
      'git-head': { type: 'string' },
      output: { type: 'string' },
    },
  });
  for (const required of ['pack-json', 'version', 'git-head', 'output']) {
    if (!values[required]) fail(`missing --${required}`);
  }
  if (!/^[0-9a-f]{40}$/.test(values['git-head'])) {
    fail(`gitHead must be a full lowercase commit SHA, got ${values['git-head']}`);
  }

  const packageJson = parseJsonFile(packagePath, 'satp-client package.json');
  if (packageJson.version !== values.version) {
    fail(`requested version ${values.version} does not match package version ${packageJson.version}`);
  }

  const packResult = parseJsonFile(path.resolve(values['pack-json']), 'npm pack dry-run output');
  if (!Array.isArray(packResult) || packResult.length !== 1) {
    fail('npm pack dry-run must describe exactly one package');
  }
  const pack = packResult[0];
  if (pack.name !== packageJson.name || pack.version !== packageJson.version) {
    fail(`pack identity ${pack.name}@${pack.version} does not match ${packageJson.name}@${packageJson.version}`);
  }
  if (!Array.isArray(pack.files) || pack.files.length === 0) {
    fail('npm pack dry-run returned no file list');
  }
  verifyExportTargets(packageJson, pack.files);

  const v3SdkPath = pack.files.find((file) => file.path === 'src/v3-sdk.js');
  if (!v3SdkPath) fail('packed file list is missing src/v3-sdk.js');
  const v3Sdk = fs.readFileSync(path.join(path.dirname(packagePath), v3SdkPath.path), 'utf8');
  for (const builder of ['buildEscrowRelease', 'buildPartialRelease']) {
    if (!new RegExp(`\\b${builder}\\s*\\(`).test(v3Sdk)) {
      fail(`packed v3-sdk is missing fee-routing builder ${builder}`);
    }
  }

  const packet = {
    package: packageJson.name,
    version: packageJson.version,
    gitHead: values['git-head'],
    packFilename: pack.filename,
    packIntegrity: pack.integrity,
    packShasum: pack.shasum,
    fileCount: pack.files.length,
    exportsVerified: Object.keys(packageJson.exports || {}),
    feeRoutingBuilders: ['SATPV3SDK.buildEscrowRelease', 'SATPV3SDK.buildPartialRelease'],
  };
  fs.mkdirSync(path.dirname(path.resolve(values.output)), { recursive: true });
  fs.writeFileSync(path.resolve(values.output), `${JSON.stringify(packet, null, 2)}\n`);
  console.log(`release prep verified: ${packet.package}@${packet.version}; gitHead=${packet.gitHead}; files=${packet.fileCount}`);
}

try {
  main();
} catch (error) {
  console.error(`release prep verification failed: ${error.message}`);
  process.exit(1);
}

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const clientRoot = path.join(repoRoot, 'packages/satp-client');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satp-client-packed-consumer-'));
const fixedUuidVersion = '11.1.1';
const releaseMetadata = JSON.parse(fs.readFileSync(
  path.join(repoRoot, 'tests/fixtures/satp-client-release-metadata.json'),
  'utf8',
));

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
  if (!current || !limit) return true;
  for (let i = 0; i < current.parts.length; i += 1) {
    if (current.parts[i] !== limit.parts[i]) return current.parts[i] < limit.parts[i];
  }
  return current.prerelease && !limit.prerelease;
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
      name: 'satp-client-packed-consumer-smoke',
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
  execFileSync('npm', ['audit', '--omit=dev', '--audit-level=moderate'], {
    cwd: tempRoot,
    stdio: 'pipe',
  });
  console.log('clean consumer with documented transitive overrides: npm audit --omit=dev --audit-level=moderate OK');

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

  if (installedPackage.bundleDependencies !== undefined) {
    throw new Error('packed client must not declare bundleDependencies');
  }
  const web3ManifestPath = require.resolve('@solana/web3.js/package.json', {
    paths: [installedPackageRoot],
  });
  if (web3ManifestPath.startsWith(`${installedPackageRoot}${path.sep}node_modules${path.sep}`)) {
    throw new Error('packed client contains a bundled @solana/web3.js dependency tree');
  }
  const jaysonManifestPath = require.resolve('jayson/package.json', {
    paths: [path.dirname(web3ManifestPath)],
  });
  const uuidManifestPath = require.resolve('uuid/package.json', {
    paths: [path.dirname(jaysonManifestPath)],
  });
  const uuidVersion = JSON.parse(fs.readFileSync(uuidManifestPath, 'utf8')).version;
  if (isVersionBefore(uuidVersion, fixedUuidVersion)) {
    throw new Error(`consumer uuid override resolved affected uuid ${uuidVersion}`);
  }

  const stableBanner = `Current stable npm package: **@brainai/satp-client@${releaseMetadata.stableLatest}**`;
  const stableInstall = `npm install @brainai/satp-client@${releaseMetadata.stableLatest}`;
  if (!installedReadme.includes(stableBanner)) {
    throw new Error(`packed README stable banner does not match npm latest ${releaseMetadata.stableLatest}`);
  }
  if (!installedReadme.includes(stableInstall)) {
    throw new Error(`packed README install command does not match npm latest ${releaseMetadata.stableLatest}`);
  }
  if (installedPackage.version !== releaseMetadata.stableLatest) {
    if (releaseMetadata.nextReleaseCandidate !== installedPackage.version) {
      throw new Error(`packed candidate ${installedPackage.version} does not match release metadata`);
    }
    const candidateBanner = `unpublished source candidate: **@brainai/satp-client@${installedPackage.version}**`;
    if (!installedReadme.includes(candidateBanner)) {
      throw new Error(`packed README candidate banner does not match ${installedPackage.version}`);
    }
  }
  if (!installedReadme.includes('[Quick Start](#quick-start)')) {
    throw new Error('packed README quickstart link does not resolve inside README.md');
  }
  if (installedReadme.includes('../../docs/')) {
    throw new Error('packed README contains repository-relative docs paths');
  }

  if (/\]\((?:\.\/)?examples\//.test(installedReadme)) {
    throw new Error('packed README contains a package-relative example link');
  }
  if (installedReadme.includes('node node_modules/@brainai/satp-client/examples/')) {
    throw new Error('packed README instructs consumers to run an example excluded from the artifact');
  }
  if (fs.existsSync(path.join(installedPackageRoot, 'examples'))) {
    throw new Error('packed client unexpectedly includes examples/');
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
    "const attestationEvidence = require('@brainai/satp-client/attestation-evidence');",
    "const attestationEvidenceResolved = require.resolve('@brainai/satp-client/attestation-evidence');",
    "if (!attestationEvidenceResolved.includes('node_modules')) throw new Error('attestation-evidence subpath did not resolve from clean consumer node_modules');",
    "for (const key of ['normalizeSatpAttestationEvidence', 'verifySatpAttestationEvidence']) {",
    "  if (typeof satp[key] !== 'function') throw new Error('missing attestation-evidence root export: ' + key);",
    "  if (typeof attestationEvidence[key] !== 'function') throw new Error('missing attestation-evidence subpath export: ' + key);",
    "}",
    "const runtimeEvidence = require('@brainai/satp-client/runtime-authorization-evidence');",
    "if (typeof runtimeEvidence !== 'object' || runtimeEvidence === null) throw new Error('runtime-authorization-evidence subpath failed');",
    "const x402Discovery = require('@brainai/satp-client/x402-discovery');",
    "if (typeof x402Discovery !== 'object' || x402Discovery === null) throw new Error('x402-discovery subpath failed');",
    "const publicPackageManifest = require('@brainai/satp-client/package.json');",
    "if (publicPackageManifest.name !== '@brainai/satp-client' || typeof publicPackageManifest.version !== 'string') throw new Error('package.json export failed');",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const publicSourceModules = fs.readdirSync(path.join(path.dirname(resolved), '.')).filter((name) => name.endsWith('.js')).sort();",
    "for (const moduleName of publicSourceModules) {",
    "  const subpath = '@brainai/satp-client/src/' + moduleName;",
    "  if (require(subpath) === undefined) throw new Error('source wildcard export failed: ' + subpath);",
    "}",
    "const genesis = satp.getAccountDiscriminator('GenesisRecord');",
    "if (!Buffer.isBuffer(genesis) || genesis.toString('hex') !== '16a0f570b27eb16a') throw new Error('GenesisRecord discriminator mismatch');",
    "if (!satp.DISCRIMINATORS.GenesisRecord.equals(genesis)) throw new Error('DISCRIMINATORS export mismatch');",
    "if (!satp.isAccountType(Buffer.concat([genesis, Buffer.from([0])]), 'GenesisRecord')) throw new Error('isAccountType failed for generated discriminator');",
    "const reader = new satp.BorshReader(Buffer.from([7]));",
    "if (reader.readU8() !== 7) throw new Error('BorshReader export smoke failed');",
    "console.log('satp-client packed consumer OK: explicit exports ., wallet-control-challenge, attestation-evidence, runtime-authorization-evidence, x402-discovery, package.json; source wildcard modules ' + publicSourceModules.join(', ') + '; root ' + resolved);",
  ].join('\n');

  const output = execFileSync(process.execPath, ['-e', check], {
    cwd: tempRoot,
    encoding: 'utf8',
  });
  process.stdout.write(output);
  console.log(
    `satp-client packed README OK: ${installedPackage.version}; consumer override uuid ${uuidVersion}; examples excluded from artifact`,
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

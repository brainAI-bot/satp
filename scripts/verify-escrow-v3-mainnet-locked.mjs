#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = resolve(root, 'docs/escrow-v3-mainnet-locked-build.json');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`escrow_v3 locked mainnet build: ${message}`);
}

function readPinned(commit, relativePath) {
  return execFileSync('git', ['show', `${commit}:${relativePath}`], {
    cwd: root,
    encoding: null,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function verifyLockedBuild({ requireArtifact = false } = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const source = readPinned(manifest.source.commit, manifest.source.path);
  const cargoLock = readPinned(manifest.source.commit, manifest.source.cargo_lock_path);
  const idlBytes = readPinned(manifest.idl.commit, manifest.idl.path);
  const idl = JSON.parse(idlBytes.toString('utf8'));

  if (sha256(source) !== manifest.source.sha256) fail('source sha256 does not match pinned manifest');
  if (sha256(cargoLock) !== manifest.source.cargo_lock_sha256) fail('Cargo.lock sha256 does not match pinned manifest');
  if (sha256(idlBytes) !== manifest.idl.sha256) fail('IDL sha256 does not match pinned manifest');
  if (idl.address !== manifest.program.program_id || idl.address !== manifest.idl.address) {
    fail(`IDL address ${idl.address || '<empty>'} is not the canonical mainnet program id`);
  }

  const instructionNames = (idl.instructions || []).map(({ name }) => name);
  if (JSON.stringify(instructionNames) !== JSON.stringify(manifest.idl.instruction_names)) {
    fail('IDL instruction order/names do not match the locked 14-instruction manifest');
  }

  const sourceText = source.toString('utf8');
  const escapedProgramId = manifest.program.program_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mainnetDeclareId = new RegExp(
    `#\\[cfg\\(not\\(feature = "devnet"\\)\\)\\]\\s*declare_id!\\("${escapedProgramId}"\\)`,
    'm'
  );
  if (!mainnetDeclareId.test(sourceText)) fail('source does not cfg-bind the canonical mainnet declare_id');
  if (!sourceText.includes('compile_error!("enable at most one escrow_v3 source identity feature")')) {
    fail('source is missing the mutually-exclusive devnet/mainnet feature guard');
  }

  let artifact;
  if (requireArtifact) {
    const artifactPath = resolve(root, manifest.build.artifact_path);
    if (!existsSync(artifactPath)) fail(`missing artifact ${manifest.build.artifact_path}`);
    artifact = readFileSync(artifactPath);
    if (artifact.length !== manifest.build.artifact_bytes) fail(`artifact is ${artifact.length} bytes`);
    if (sha256(artifact) !== manifest.build.artifact_sha256) fail('artifact sha256 does not match locked manifest');
  }

  return {
    ok: true,
    source_commit: manifest.source.commit,
    source_sha256: manifest.source.sha256,
    cargo_lock_sha256: manifest.source.cargo_lock_sha256,
    artifact_sha256: artifact ? sha256(artifact) : null,
    artifact_bytes: artifact?.length ?? null,
    idl_sha256: manifest.idl.sha256,
    idl_address: idl.address,
    instruction_count: instructionNames.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = verifyLockedBuild({ requireArtifact: process.argv.includes('--artifact') });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

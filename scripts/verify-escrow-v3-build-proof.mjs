#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const referencePath = resolve(root, 'docs/escrow-v3-build-proof-reference.json');

function fail(message) {
  console.error(`escrow_v3 build proof failed: ${message}`);
  process.exit(1);
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

if (!existsSync(referencePath)) {
  fail(`missing reference ${relative(root, referencePath)}`);
}

const reference = JSON.parse(readText(referencePath));
const artifactPath = resolve(root, reference.artifact_path);

if (!existsSync(artifactPath)) {
  fail(`missing built artifact ${reference.artifact_path}`);
}

const anchorToml = readText(resolve(root, 'Anchor.toml'));
const cargoToml = readText(resolve(root, 'Cargo.toml'));
const toolchainToml = readText(resolve(root, 'rust-toolchain.toml'));
const buildCommand = reference.toolchain?.build_command || '';

if (!anchorToml.includes(`${reference.program} = "${reference.program_id}"`)) {
  fail(`Anchor.toml does not bind ${reference.program} to ${reference.program_id}`);
}

if (!cargoToml.includes('"programs/*"')) {
  fail('workspace Cargo.toml is not rooted on programs/*');
}

if (!toolchainToml.includes('channel = "1.86.0"')) {
  fail('rust-toolchain.toml does not pin the host Rust toolchain');
}

if (!buildCommand.includes('--tools-version v1.52')) {
  fail('reference build command does not pin SBF platform-tools v1.52');
}

if (!buildCommand.includes('--manifest-path programs/escrow_v3/Cargo.toml')) {
  fail('reference build command is not scoped to programs/escrow_v3/Cargo.toml');
}

if (process.env.SOLANA_VERSION && process.env.SOLANA_VERSION !== reference.toolchain.solana_cli_version) {
  fail(`SOLANA_VERSION=${process.env.SOLANA_VERSION} does not match reference ${reference.toolchain.solana_cli_version}`);
}

if (process.env.SBF_TOOLS_VERSION && process.env.SBF_TOOLS_VERSION !== reference.toolchain.sbf_tools_version) {
  fail(`SBF_TOOLS_VERSION=${process.env.SBF_TOOLS_VERSION} does not match reference ${reference.toolchain.sbf_tools_version}`);
}

const artifactSha256 = sha256File(artifactPath);
const sourceBuildSha256 = reference.source_build.sha256;
const chainSha256 = reference.chain_reference.sha256;
const sourceMatchesExpectedBuild = artifactSha256 === sourceBuildSha256;
const sourceMatchesChain = artifactSha256 === chainSha256;

console.log(JSON.stringify({
  ok: sourceMatchesExpectedBuild && sourceMatchesChain,
  program: reference.program,
  program_id: reference.program_id,
  cluster: reference.cluster,
  artifact_path: reference.artifact_path,
  artifact_sha256: artifactSha256,
  expected_source_build_sha256: sourceBuildSha256,
  chain_reference_sha256: chainSha256,
  source_matches_expected_build: sourceMatchesExpectedBuild,
  source_matches_chain: sourceMatchesChain,
  reference: relative(root, referencePath),
}, null, 2));

if (!sourceMatchesExpectedBuild) {
  fail(`built artifact hash ${artifactSha256} does not match expected source build ${sourceBuildSha256}`);
}

if (!sourceMatchesChain) {
  fail(`source-to-chain mismatch: built artifact hash ${artifactSha256} does not match devnet dump ${chainSha256}`);
}

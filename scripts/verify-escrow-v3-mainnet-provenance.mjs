#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = resolve(root, 'docs/escrow-v3-mainnet-provenance-ef7e4581.json');
const expectedRepositories = new Set([
  'brainAI-bot/satp',
  'brainAI-bot/agentfolio',
  'brainAI-bot/clawd-brainchain',
]);
const expectedBuildProfiles = new Set(['default', 'mainnet', 'devnet']);
const expectedMissingInstructions = new Set([
  'create_usdc_escrow',
  'release_usdc',
  'partial_release_usdc',
  'cancel_usdc',
  'resolve_dispute_usdc',
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function buildProfile(attempt) {
  const features = attempt.features || [];
  return features.length === 0 ? 'default' : features.join(',');
}

export function validateProvenanceManifest(manifest) {
  invariant(manifest.schema_version === 1, 'schema_version must be 1');
  invariant(manifest.marker === '[#ef7e4581]', 'marker must be [#ef7e4581]');
  invariant(manifest.status === 'provenance_gap', 'status must remain provenance_gap until exact reproduction exists');

  const runtime = manifest.runtime || {};
  invariant(runtime.allocated_payload_bytes + runtime.loader_header_bytes === runtime.program_data_account_bytes,
    'ProgramData account length must equal loader header plus allocated payload');
  invariant(runtime.allocated_payload_bytes - runtime.trailing_zero_bytes === runtime.trimmed_payload_bytes,
    'trimmed payload length must account for every recorded trailing zero byte');
  invariant(/^[a-f0-9]{64}$/.test(runtime.allocated_payload_sha256 || ''), 'allocated payload hash must be SHA-256');
  invariant(/^[a-f0-9]{64}$/.test(runtime.trimmed_payload_sha256 || ''), 'trimmed payload hash must be SHA-256');
  invariant(runtime.allocated_payload_sha256 !== runtime.trimmed_payload_sha256,
    'allocated and trimmed payload hashes must remain distinct');

  const candidate = manifest.closest_satp_candidate || {};
  const published = manifest.published_idl || {};
  invariant(candidate.source_idl_instruction_count === candidate.source_idl_instruction_names?.length,
    'source IDL instruction count must match its names');
  invariant(published.instruction_count === published.instruction_names?.length,
    'published IDL instruction count must match its names');
  invariant(candidate.source_idl_instruction_count === 14, 'closest SATP candidate must record 14 instructions');
  invariant(published.instruction_count === 9, 'published mainnet IDL must record 9 instructions');
  invariant(candidate.source_idl_instruction_names.every((name) =>
    published.instruction_names.includes(name) || expectedMissingInstructions.has(name)),
  'source IDL must equal the published surface plus the five recorded USDC instructions');
  invariant(new Set(candidate.instructions_missing_from_published_idl).size === expectedMissingInstructions.size &&
    [...expectedMissingInstructions].every((name) => candidate.instructions_missing_from_published_idl.includes(name)),
  'missing instruction set must be the five USDC entrypoints');

  const repositories = new Set((manifest.repository_searches || []).map((entry) => entry.repository));
  invariant(repositories.size === expectedRepositories.size &&
    [...expectedRepositories].every((repository) => repositories.has(repository)),
  'repository search packet must cover SATP, AgentFolio, and clawd-brainchain');

  const attempts = manifest.build_attempts || [];
  invariant(attempts.length >= 6, 'build packet must retain every recorded source/toolchain attempt');
  invariant(attempts.every((attempt) => attempt.repository && attempt.commit && attempt.command &&
    attempt.sbf_platform_tools && attempt.artifact_sha256 && attempt.verdict === 'DIFFER'),
  'every build attempt must name repo/ref/command/toolchain/hash and preserve its DIFFER verdict');
  invariant(attempts.every((attempt) =>
    attempt.artifact_sha256 !== runtime.allocated_payload_sha256 &&
    attempt.artifact_sha256 !== runtime.trimmed_payload_sha256),
  'no recorded build artifact may equal either deployed payload hash');

  const satpProfiles = new Set(attempts
    .filter((attempt) => attempt.repository === 'brainAI-bot/satp' && attempt.commit === candidate.commit)
    .map(buildProfile));
  invariant([...expectedBuildProfiles].every((profile) => satpProfiles.has(profile)),
    'closest SATP candidate must retain default, mainnet, and devnet build evidence');

  const conclusion = manifest.conclusion || {};
  invariant(conclusion.authoritative_source_commit === null,
    'authoritative source commit must stay null while every recorded build differs');
  invariant(conclusion.complete_locked_build_inputs === null,
    'complete locked build inputs must stay null while the original recipe is unrecovered');
  invariant(conclusion.source_equals_deployed_binary_equals_published_idl === false,
    'source/deployed/IDL certification must fail closed');

  const safety = manifest.safety || {};
  invariant(Object.values(safety).every((value) => value === false), 'all mutation safety flags must remain false');
  return true;
}

function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validateProvenanceManifest(manifest);
  console.log(JSON.stringify({
    ok: true,
    status: manifest.status,
    marker: manifest.marker,
    runtime_allocated_sha256: manifest.runtime.allocated_payload_sha256,
    runtime_trimmed_sha256: manifest.runtime.trimmed_payload_sha256,
    candidate_commit: manifest.closest_satp_candidate.commit,
    candidate_builds: manifest.build_attempts.length,
    published_idl_instructions: manifest.published_idl.instruction_count,
    source_idl_instructions: manifest.closest_satp_candidate.source_idl_instruction_count,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`escrow_v3 mainnet provenance failed: ${error.message}`);
    process.exitCode = 1;
  }
}

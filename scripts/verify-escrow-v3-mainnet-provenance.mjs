#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

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
const upgradeableLoader = 'BPFLoaderUpgradeab1e11111111111111111111111';
const programStateTag = 2;
const programDataStateTag = 3;
const programDataHeaderBytes = 45;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function setEquals(actual, expected) {
  return actual.size === expected.size && [...expected].every((value) => actual.has(value));
}

function buildProfile(attempt) {
  const features = attempt.features || [];
  return features.length === 0 ? 'default' : features.join(',');
}

export function validateProvenanceManifest(manifest) {
  invariant(manifest.schema_version === 1, 'schema_version must be 1');
  invariant(manifest.marker === '[#ef7e4581]', 'marker must be [#ef7e4581]');
  invariant(manifest.status === 'provenance_gap', 'status must remain provenance_gap until exact reproduction exists');

  invariant(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(manifest.recertified_at_utc || ''),
    'recertified_at_utc must be a UTC timestamp');
  const recertification = manifest.recertification || {};
  invariant(Number.isSafeInteger(recertification.rpc_slot) && recertification.rpc_slot > 0,
    'recertification rpc_slot must be a positive integer');
  invariant(recertification.runtime_drift === false, 'runtime drift must fail closed');
  invariant(recertification.published_idl_drift === false, 'published IDL drift must fail closed');

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

export async function verifyLiveMainnet(manifest) {
  const { Connection, PublicKey, clusterApiUrl } = await import('@solana/web3.js');
  const runtime = manifest.runtime;
  const published = manifest.published_idl;
  const loader = new PublicKey(upgradeableLoader);
  const programId = new PublicKey(runtime.program_id);
  const idlAddress = new PublicKey(published.account);
  const rpcUrl = process.env.ESCROW_V3_RPC_URL_MAINNET_BETA || clusterApiUrl('mainnet-beta');
  const connection = new Connection(rpcUrl, 'confirmed');

  const programResponse = await connection.getAccountInfoAndContext(programId, 'confirmed');
  const programAccount = programResponse.value;
  invariant(programAccount, `mainnet program account ${runtime.program_id} was not found`);
  invariant(programAccount.owner.equals(loader), 'mainnet program is not owned by the upgradeable loader');
  invariant(programAccount.data.length === 36 && programAccount.data.readUInt32LE(0) === programStateTag,
    'mainnet program account is not an upgradeable Program account');
  const programDataAddress = new PublicKey(programAccount.data.subarray(4, 36));
  invariant(programDataAddress.toBase58() === runtime.program_data, 'mainnet ProgramData address drifted');

  const accountsResponse = await connection.getMultipleAccountsInfoAndContext(
    [programDataAddress, idlAddress],
    'confirmed'
  );
  const [programDataAccount, idlAccount] = accountsResponse.value;
  invariant(programDataAccount, `mainnet ProgramData account ${runtime.program_data} was not found`);
  invariant(idlAccount, `mainnet IDL account ${published.account} was not found`);
  invariant(programDataAccount.owner.equals(loader), 'mainnet ProgramData owner drifted');
  invariant(programDataAccount.data.readUInt32LE(0) === programDataStateTag,
    'mainnet ProgramData account tag drifted');
  invariant(programDataAccount.data.length === runtime.program_data_account_bytes,
    'mainnet ProgramData account length drifted');
  invariant(Number(programDataAccount.data.readBigUInt64LE(4)) === runtime.upgrade_slot,
    'mainnet deployed slot drifted');
  invariant(programDataAccount.data[12] === 1, 'mainnet upgrade authority option drifted');
  invariant(new PublicKey(programDataAccount.data.subarray(13, 45)).toBase58() === runtime.upgrade_authority,
    'mainnet upgrade authority drifted');

  const allocatedPayload = programDataAccount.data.subarray(programDataHeaderBytes);
  invariant(allocatedPayload.length === runtime.allocated_payload_bytes,
    'mainnet allocated payload length drifted');
  invariant(sha256(allocatedPayload) === runtime.allocated_payload_sha256,
    'mainnet allocated payload hash drifted');
  let trailingZeroBytes = 0;
  while (trailingZeroBytes < allocatedPayload.length &&
    allocatedPayload[allocatedPayload.length - trailingZeroBytes - 1] === 0) {
    trailingZeroBytes += 1;
  }
  invariant(trailingZeroBytes === runtime.trailing_zero_bytes, 'mainnet trailing zero count drifted');
  const trimmedPayload = allocatedPayload.subarray(0, allocatedPayload.length - trailingZeroBytes);
  invariant(trimmedPayload.length === runtime.trimmed_payload_bytes, 'mainnet trimmed payload length drifted');
  invariant(sha256(trimmedPayload) === runtime.trimmed_payload_sha256,
    'mainnet trimmed payload hash drifted');

  invariant(idlAccount.owner.equals(programId), 'mainnet published IDL owner drifted');
  invariant(idlAccount.data.length === published.account_bytes, 'mainnet published IDL account length drifted');
  const compressedLength = idlAccount.data.readUInt32LE(40);
  const inflatedJson = inflateSync(idlAccount.data.subarray(44, 44 + compressedLength));
  invariant(inflatedJson.length === published.inflated_json_bytes,
    'mainnet published IDL inflated length drifted');
  invariant(sha256(inflatedJson) === published.inflated_json_sha256,
    'mainnet published IDL hash drifted');
  const idl = JSON.parse(inflatedJson.toString('utf8'));
  const instructionNames = new Set((idl.instructions || []).map((instruction) => instruction.name));
  invariant(instructionNames.size === published.instruction_count,
    'mainnet published IDL instruction count drifted');
  invariant(setEquals(instructionNames, new Set(published.instruction_names)),
    'mainnet published IDL instruction names drifted');

  return {
    rpc_slot: accountsResponse.context.slot,
    program_data: programDataAddress.toBase58(),
    upgrade_slot: Number(programDataAccount.data.readBigUInt64LE(4)),
    allocated_payload_bytes: allocatedPayload.length,
    allocated_payload_sha256: sha256(allocatedPayload),
    trimmed_payload_bytes: trimmedPayload.length,
    trimmed_payload_sha256: sha256(trimmedPayload),
    idl_account: idlAddress.toBase58(),
    idl_account_bytes: idlAccount.data.length,
    idl_inflated_json_bytes: inflatedJson.length,
    idl_inflated_json_sha256: sha256(inflatedJson),
    idl_instruction_count: instructionNames.size,
    drift: false,
  };
}

async function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validateProvenanceManifest(manifest);
  const live = process.argv.includes('--live') ? await verifyLiveMainnet(manifest) : undefined;
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
    live,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`escrow_v3 mainnet provenance failed: ${error.message}`);
    process.exitCode = 1;
  }
}

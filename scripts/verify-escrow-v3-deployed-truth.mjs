#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = resolve(root, 'docs/escrow-v3-deployed-truth.json');
const loaderId = 'BPFLoaderUpgradeab1e11111111111111111111111';
const metadataProgramId = 'ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S';
const programStateTag = 2;
const programDataStateTag = 3;
const programDataHeaderBytes = 45;
const metadataDirectDataOffset = 96;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function equalArray(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function gitObject(ref, path) {
  return execFileSync('git', ['show', `${ref}:${path}`], { cwd: root });
}

function instructionAccountNames(idl, name) {
  const instruction = idl.instructions.find((entry) => entry.name === name);
  invariant(instruction, `IDL is missing ${name}`);
  return instruction.accounts.map((account) => account.name);
}

function instructionAccountSchema(idl, name) {
  const instruction = idl.instructions.find((entry) => entry.name === name);
  invariant(instruction, `IDL is missing ${name}`);
  return instruction.accounts.map((account) => ({
    name: account.name,
    writable: Boolean(account.writable),
    signer: Boolean(account.signer),
  }));
}

function equalAccountSchema(actual, expected) {
  return actual.length === expected.length && actual.every((account, index) => {
    const expectedAccount = expected[index];
    return account.name === expectedAccount.name &&
      account.writable === expectedAccount.writable &&
      account.signer === expectedAccount.signer;
  });
}

export function validateDeployedTruth(manifest) {
  invariant(manifest.schema_version === 2, 'schema_version must be 2');
  invariant(manifest.status === 'source_binary_verified_program_metadata_account_schema_delta_fail_closed',
    'unexpected truth status');
  const program = manifest.program;
  const source = manifest.verified_source;
  const canonical = manifest.canonical_idl;
  const metadata = manifest.program_metadata_idl;
  const legacy = manifest.legacy_anchor_idl;
  const conclusion = manifest.conclusion;

  invariant(source.commit === canonical.generated_from_source_commit,
    'canonical IDL must name the verified deployed source commit');
  invariant(source.artifact_sha256 === program.source_artifact_prefix_sha256,
    'verified source artifact hash must equal deployed payload prefix hash');
  invariant(source.artifact_bytes === program.source_artifact_prefix_bytes,
    'verified source artifact length must equal deployed payload prefix length');
  invariant(source.deployed_comparison === 'MATCH_ALLOCATED_PREFIX_WITH_ZERO_PADDING',
    'verified source comparison must describe the allocated prefix and padding');
  invariant(program.allocated_payload_bytes === program.source_artifact_prefix_bytes + program.allocation_padding_bytes,
    'allocated payload length must equal source artifact plus loader padding');
  invariant(program.allocation_padding_sha256 === sha256(Buffer.alloc(program.allocation_padding_bytes)),
    'allocation padding hash must be the exact all-zero suffix hash');
  invariant(program.last_non_zero_payload_bytes
    === source.artifact_bytes - program.intrinsic_artifact_trailing_zero_bytes,
  'last-non-zero boundary must account for zeros intrinsic to the source artifact');

  invariant(canonical.address === program.program_id, 'canonical IDL address must equal program id');
  invariant(/^[0-9a-f]{40}$/u.test(canonical.recorded_at_commit),
    'canonical IDL historical recording commit must remain recorded');
  invariant(canonical.recorded_commit_reachability === 'historical_squashed_not_required',
    'canonical IDL historical commit reachability must be explicitly squash-safe');
  invariant(canonical.instruction_count === canonical.instruction_names.length,
    'canonical instruction count must match names');
  invariant(metadata.instruction_count === metadata.instruction_names.length,
    'Program Metadata instruction count must match names');
  invariant(legacy.instruction_count === legacy.instruction_names.length,
    'legacy Anchor instruction count must match names');
  invariant(canonical.instruction_count === 14, 'verified-source canonical IDL must contain 14 instructions');
  invariant(metadata.instruction_count === 14, 'Program Metadata IDL must contain 14 instructions');
  invariant(legacy.instruction_count === 9, 'legacy Anchor IDL must contain 9 instructions');
  invariant(equalArray(metadata.instruction_names, canonical.instruction_names),
    'Program Metadata instruction surface must match the verified-source canonical IDL');
  invariant(metadata.status === 'instruction_names_match_account_schema_delta_fail_closed',
    'Program Metadata IDL status must record account-schema fail-closed state');
  invariant(metadata.canonical_read_path === false,
    'Program Metadata IDL must not advertise canonical read-path status while account schemas differ');
  invariant(legacy.status === 'stale_not_canonical', 'legacy Anchor IDL must remain explicitly stale');
  invariant(metadata.owner === metadataProgramId, 'Program Metadata owner must stay pinned');

  invariant(conclusion.source_artifact_equals_deployed_payload_prefix === true,
    'source/deployed-prefix equality must be explicit');
  invariant(conclusion.source_equals_deployed_binary === true, 'source/binary equality must be explicit');
  invariant(conclusion.canonical_repo_idl_generated_from_verified_source === true,
    'canonical IDL provenance must be explicit');
  invariant(conclusion.program_metadata_idl_exposes_current_instruction_set === true,
    'Program Metadata must expose the current 14-instruction set');
  invariant(conclusion.program_metadata_idl_is_canonical_anchor_1_0_read_path === false,
    'Program Metadata canonical Anchor 1.0 read path must fail closed while account schemas differ');
  invariant(conclusion.program_metadata_fee_routing_account_schema_matches_canonical_repo_idl === false,
    'Program Metadata fee-routing account schema mismatch must remain explicit');
  invariant(conclusion.program_metadata_idl_matches_canonical_repo_idl_byte_for_byte === false,
    'Program Metadata/repo byte-level difference must remain explicit');
  invariant(conclusion.legacy_anchor_idl_matches_canonical_repo_idl === false,
    'stale legacy Anchor IDL must not be certified');
  invariant(conclusion.legacy_anchor_idl_is_canonical_read_path === false,
    'legacy Anchor IDL must not be represented as canonical');
  invariant(conclusion.published_idl_matches_canonical_repo_idl === false,
    'published IDL surfaces must not be represented as byte-identical to the repo IDL');
  invariant(conclusion.published_program_metadata_is_canonical === false,
    'published Program Metadata must not be canonical while account schemas differ');
  invariant(conclusion.fee_routing_is_deployed === true, 'deployed fee routing must remain explicit');
  invariant(conclusion.canonical_idl_publish_reconciled === false,
    'canonical IDL publication must remain unreconciled while Program Metadata lacks fee-routing accounts');
  invariant(conclusion.consumer_escrow_unpause_ready === false,
    'consumer escrow must remain gated');
  invariant(Object.values(manifest.safety).every((value) => value === false),
    'all mutation safety flags must remain false');

  const canonicalBytes = readFileSync(resolve(root, canonical.path));
  invariant(typeof canonical.recorded_fixture_path === 'string' && canonical.recorded_fixture_path.length > 0,
    'canonical IDL recorded fixture path is required');
  invariant(canonical.recorded_fixture_model === 'squash_safe_current_tree_fixture',
    'canonical IDL recorded fixture model must be squash-safe');
  const recordedCanonicalBytes = readFileSync(resolve(root, canonical.recorded_fixture_path));
  const canonicalIdl = JSON.parse(canonicalBytes);
  invariant(canonicalBytes.length === canonical.bytes, 'canonical IDL byte length drifted');
  invariant(sha256(canonicalBytes) === canonical.sha256, 'canonical IDL file hash drifted');
  invariant(recordedCanonicalBytes.length === canonical.bytes, 'canonical IDL fixture byte length drifted');
  invariant(sha256(recordedCanonicalBytes) === canonical.sha256, 'recorded canonical IDL fixture hash drifted');
  invariant(recordedCanonicalBytes.equals(canonicalBytes),
    'recorded canonical IDL fixture must match the committed canonical file');
  invariant(canonicalIdl.address === canonical.address, 'canonical IDL file address drifted');
  invariant(equalArray(canonicalIdl.instructions.map(({ name }) => name), canonical.instruction_names),
    'canonical IDL instruction surface drifted');
  for (const [name, expectedAccounts] of Object.entries(canonical.required_fee_routing_accounts)) {
    invariant(equalArray(instructionAccountNames(canonicalIdl, name), expectedAccounts),
      `canonical IDL ${name} account surface drifted`);
    const metadataSchema = metadata.fee_routing_account_schemas?.[name];
    invariant(Array.isArray(metadataSchema), `Program Metadata ${name} account schema must be recorded`);
    const canonicalSchema = instructionAccountSchema(canonicalIdl, name);
    invariant(!equalAccountSchema(metadataSchema, canonicalSchema),
      `recorded fail-closed delta is stale: Program Metadata ${name} now matches the canonical IDL; update the manifest and publication conclusion`);
    const missing = expectedAccounts.filter((account) => !metadataSchema.some((entry) => entry.name === account));
    invariant(equalArray(missing, metadata.repo_idl_account_surface_delta[name] || []),
      `Program Metadata ${name} recorded account delta drifted`);
  }

  invariant(sha256(gitObject(source.commit, source.path)) === source.sha256,
    'verified source commit/path hash drifted');
  invariant(sha256(gitObject(source.commit, 'Cargo.lock')) === source.cargo_lock_sha256,
    'verified source Cargo.lock hash drifted');
  return true;
}

function decodeProgramMetadata(data, expected, programId, PublicKey) {
  invariant(data.length === expected.account_bytes, 'Program Metadata account length drifted');
  invariant(sha256(data) === expected.account_data_sha256, 'Program Metadata account hash drifted');
  invariant(data[0] === 2, 'Program Metadata discriminator drifted');
  invariant(new PublicKey(data.subarray(1, 33)).toBase58() === programId,
    'Program Metadata program address drifted');
  invariant(data[65] === 1 && data[66] === 1, 'Program Metadata mutability/canonical flags drifted');
  invariant(data.subarray(67, 83).toString('utf8').replace(/\0+$/u, '') === expected.seed,
    'Program Metadata seed drifted');
  invariant(data[83] === 1, 'Program Metadata encoding must remain UTF-8');
  invariant(data[84] === 2, 'Program Metadata compression must remain zlib');
  invariant(data[85] === 1, 'Program Metadata format must remain JSON');
  invariant(data[86] === 0, 'Program Metadata data source must remain direct');
  const declaredLength = data.readUInt32LE(87);
  invariant(declaredLength === expected.content_zlib_bytes, 'Program Metadata declared data length drifted');
  invariant(data.subarray(92, metadataDirectDataOffset).equals(Buffer.alloc(4)),
    'Program Metadata direct-data prefix drifted');
  invariant(metadataDirectDataOffset + declaredLength === data.length,
    'Program Metadata account contains unexpected trailing bytes');
  const content = inflateSync(data.subarray(metadataDirectDataOffset));
  const idl = JSON.parse(content.toString('utf8'));
  const canonicalJson = Buffer.from(JSON.stringify(idl));
  invariant(canonicalJson.length === expected.canonical_json_bytes,
    'Program Metadata canonical JSON length drifted');
  invariant(sha256(canonicalJson) === expected.canonical_json_sha256,
    'Program Metadata canonical JSON hash drifted');
  invariant(equalArray(idl.instructions.map(({ name }) => name), expected.instruction_names),
    'Program Metadata instruction surface drifted');
  for (const [name, expectedMissing] of Object.entries(expected.repo_idl_account_surface_delta)) {
    const actualSchema = instructionAccountSchema(idl, name);
    invariant(equalAccountSchema(actualSchema, expected.fee_routing_account_schemas[name]),
      `Program Metadata ${name} account schema drifted`);
    const actualAccounts = actualSchema.map((account) => account.name);
    const missing = expectedMissing.filter((account) => !actualAccounts.includes(account));
    invariant(equalArray(missing, expectedMissing),
      `Program Metadata ${name} no longer has the recorded repo-IDL account delta`);
  }
  return { idl, canonicalJson };
}

async function fetchLive(manifest) {
  const { Connection, PublicKey, clusterApiUrl } = await import('@solana/web3.js');
  const program = manifest.program;
  const legacy = manifest.legacy_anchor_idl;
  const metadata = manifest.program_metadata_idl;
  const loader = new PublicKey(loaderId);
  const metadataProgram = new PublicKey(metadataProgramId);
  const programId = new PublicKey(program.program_id);
  const legacyAddress = new PublicKey(legacy.account);
  const metadataAddress = new PublicKey(metadata.account);
  const rpcUrl = process.env.ESCROW_V3_RPC_URL_MAINNET_BETA || clusterApiUrl('mainnet-beta');
  const connection = new Connection(rpcUrl, 'finalized');

  const programAccount = await connection.getAccountInfo(programId, 'finalized');
  invariant(programAccount, `program account ${program.program_id} not found`);
  invariant(programAccount.owner.equals(loader), 'program owner drifted');
  invariant(programAccount.data.length === 36 && programAccount.data.readUInt32LE(0) === programStateTag,
    'program account is not upgradeable');
  const programDataAddress = new PublicKey(programAccount.data.subarray(4, 36));
  invariant(programDataAddress.toBase58() === program.program_data, 'ProgramData address drifted');

  const response = await connection.getMultipleAccountsInfoAndContext(
    [programDataAddress, legacyAddress, metadataAddress],
    'finalized',
  );
  const [programDataAccount, legacyAccount, metadataAccount] = response.value;
  invariant(programDataAccount && legacyAccount && metadataAccount,
    'ProgramData or published IDL account missing');
  invariant(programDataAccount.owner.equals(loader), 'ProgramData owner drifted');
  invariant(programDataAccount.data.readUInt32LE(0) === programDataStateTag, 'ProgramData tag drifted');
  invariant(programDataAccount.data.length === program.program_data_account_bytes, 'ProgramData length drifted');
  invariant(Number(programDataAccount.data.readBigUInt64LE(4)) === program.upgrade_slot, 'deployed slot drifted');

  const allocated = programDataAccount.data.subarray(programDataHeaderBytes);
  const sourcePrefix = allocated.subarray(0, program.source_artifact_prefix_bytes);
  const allocationPadding = allocated.subarray(program.source_artifact_prefix_bytes);
  let lastNonZero = allocated.length;
  while (lastNonZero > 0 && allocated[lastNonZero - 1] === 0) lastNonZero -= 1;
  invariant(allocated.length === program.allocated_payload_bytes, 'allocated payload length drifted');
  invariant(sha256(allocated) === program.allocated_payload_sha256, 'allocated payload hash drifted');
  invariant(sha256(sourcePrefix) === program.source_artifact_prefix_sha256,
    'deployed source artifact prefix hash drifted');
  invariant(allocationPadding.length === program.allocation_padding_bytes, 'allocation padding length drifted');
  invariant(allocationPadding.every((byte) => byte === 0), 'allocation padding contains non-zero bytes');
  invariant(sha256(allocationPadding) === program.allocation_padding_sha256,
    'allocation padding hash drifted');
  invariant(lastNonZero === program.last_non_zero_payload_bytes, 'last-non-zero payload boundary drifted');
  invariant(sha256(allocated.subarray(0, lastNonZero)) === program.last_non_zero_payload_sha256,
    'last-non-zero payload hash drifted');

  invariant(legacyAccount.owner.equals(programId), 'legacy Anchor IDL owner drifted');
  invariant(legacyAccount.data.length === legacy.account_bytes, 'legacy Anchor IDL account length drifted');
  const legacyCompressedLength = legacyAccount.data.readUInt32LE(40);
  const legacyInflated = inflateSync(legacyAccount.data.subarray(44, 44 + legacyCompressedLength));
  const legacyIdl = JSON.parse(legacyInflated.toString('utf8'));
  const legacyNames = legacyIdl.instructions.map(({ name }) => name).sort();
  invariant(legacyInflated.length === legacy.inflated_json_bytes, 'legacy Anchor IDL inflated length drifted');
  invariant(sha256(legacyInflated) === legacy.inflated_json_sha256, 'legacy Anchor IDL hash drifted');
  invariant(equalArray(legacyNames, legacy.instruction_names), 'legacy Anchor IDL instructions drifted');

  invariant(metadataAccount.owner.equals(metadataProgram), 'Program Metadata owner drifted');
  const decodedMetadata = decodeProgramMetadata(metadataAccount.data, metadata, program.program_id, PublicKey);

  const artifactPath = process.env.ESCROW_V3_DEPLOYED_SOURCE_ARTIFACT;
  if (artifactPath) {
    invariant(existsSync(artifactPath), `source artifact missing: ${artifactPath}`);
    const artifact = readFileSync(artifactPath);
    invariant(artifact.length === sourcePrefix.length, 'source artifact length differs from deployed prefix');
    invariant(artifact.equals(sourcePrefix), 'source artifact differs from deployed prefix');
  }

  return {
    rpc_slot: response.context.slot,
    commitment: 'finalized',
    upgrade_slot: Number(programDataAccount.data.readBigUInt64LE(4)),
    program_data_account_bytes: programDataAccount.data.length,
    allocated_payload_bytes: allocated.length,
    allocated_payload_sha256: sha256(allocated),
    source_artifact_prefix_bytes: sourcePrefix.length,
    source_artifact_prefix_sha256: sha256(sourcePrefix),
    allocation_padding_bytes: allocationPadding.length,
    source_artifact_compared: Boolean(artifactPath),
    program_metadata_idl_sha256: sha256(decodedMetadata.canonicalJson),
    program_metadata_idl_instruction_count: decodedMetadata.idl.instructions.length,
    legacy_anchor_idl_sha256: sha256(legacyInflated),
    legacy_anchor_idl_instruction_count: legacyNames.length,
    drift: false,
  };
}

async function main() {
  const manifest = readJson(manifestPath);
  validateDeployedTruth(manifest);
  const live = process.argv.includes('--live') ? await fetchLive(manifest) : undefined;
  console.log(JSON.stringify({
    ok: true,
    status: manifest.status,
    source_commit: manifest.verified_source.commit,
    source_binary_verdict: manifest.verified_source.deployed_comparison,
    canonical_idl_instructions: manifest.canonical_idl.instruction_count,
    program_metadata_idl_status: manifest.program_metadata_idl.status,
    legacy_anchor_idl_status: manifest.legacy_anchor_idl.status,
    program_metadata_canonical_read_path: manifest.program_metadata_idl.canonical_read_path,
    program_metadata_fee_routing_account_schema_matches_canonical_repo_idl:
      manifest.conclusion.program_metadata_fee_routing_account_schema_matches_canonical_repo_idl,
    fee_routing_is_deployed: manifest.conclusion.fee_routing_is_deployed,
    consumer_escrow_unpause_ready: manifest.conclusion.consumer_escrow_unpause_ready,
    live,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`escrow_v3 deployed truth failed: ${error.message}`);
    process.exitCode = 1;
  }
}

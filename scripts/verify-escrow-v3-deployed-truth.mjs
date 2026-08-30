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
const programStateTag = 2;
const programDataStateTag = 3;
const programDataHeaderBytes = 45;

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

export function validateDeployedTruth(manifest) {
  invariant(manifest.schema_version === 1, 'schema_version must be 1');
  invariant(manifest.status === 'source_binary_verified_published_idl_stale', 'unexpected truth status');
  const program = manifest.program;
  const source = manifest.verified_source;
  const canonical = manifest.canonical_idl;
  const published = manifest.published_idl;
  const pending = manifest.pending_source_head;
  const conclusion = manifest.conclusion;

  invariant(source.commit === canonical.generated_from_source_commit,
    'canonical IDL must name the verified deployed source commit');
  invariant(source.artifact_sha256 === program.allocated_payload_sha256,
    'verified source artifact hash must equal deployed allocated payload hash');
  invariant(source.artifact_bytes === program.allocated_payload_bytes,
    'verified source artifact length must equal deployed allocated payload length');
  invariant(source.verdict === 'MATCH', 'verified source verdict must be MATCH');
  invariant(canonical.address === program.program_id, 'canonical IDL address must equal program id');
  invariant(canonical.instruction_count === canonical.instruction_names.length,
    'canonical instruction count must match names');
  invariant(published.instruction_count === published.instruction_names.length,
    'published instruction count must match names');
  invariant(canonical.instruction_count === 14, 'verified-source canonical IDL must contain 14 instructions');
  invariant(published.instruction_count === 9, 'stale published IDL must contain 9 instructions');
  invariant(published.status === 'stale_not_canonical', 'published IDL must remain explicitly stale');
  invariant(pending.artifact_sha256 !== program.allocated_payload_sha256,
    'pending fee-routing artifact must not be represented as deployed');
  invariant(pending.status === 'fee_routing_and_usdc_source_merged_owner_gated_no_mainnet_write',
    'pending source status must remain honest');
  invariant(pending.rider_packet === 'docs/escrow-v3-mainnet-rider-packet.md',
    'pending source must point to the owner-gated rider packet');
  const riderPacketPath = resolve(root, pending.rider_packet);
  invariant(existsSync(riderPacketPath), 'owner-gated rider packet is missing');
  const riderPacket = readFileSync(riderPacketPath, 'utf8');
  invariant(riderPacket.includes('Status: prepared, not executed.'), 'rider packet status must remain fail-closed');
  invariant(riderPacket.includes(source.artifact_sha256), 'rider packet must bind the deployed artifact');
  invariant(riderPacket.includes(pending.artifact_sha256), 'rider packet must bind the pending artifact');
  for (const route of ['create_usdc_escrow', 'release_usdc', 'partial_release_usdc', 'cancel_usdc', 'resolve_dispute_usdc']) {
    invariant(riderPacket.includes(`\`${route}\``), `rider packet missing ${route}`);
  }
  invariant(conclusion.source_equals_deployed_binary === true, 'source/binary equality must be explicit');
  invariant(conclusion.canonical_repo_idl_generated_from_verified_source === true,
    'canonical IDL provenance must be explicit');
  invariant(conclusion.published_idl_matches_canonical_repo_idl === false,
    'stale published IDL must not be certified');
  invariant(conclusion.fee_routing_is_deployed === false, 'fee routing must not be marked deployed');
  invariant(conclusion.consumer_escrow_unpause_ready === false, 'consumer escrow must remain gated');
  invariant(Object.values(manifest.safety).every((value) => value === false),
    'all mutation safety flags must remain false');

  const canonicalBytes = readFileSync(resolve(root, canonical.path));
  const canonicalIdl = JSON.parse(canonicalBytes);
  invariant(sha256(canonicalBytes) === canonical.sha256, 'canonical IDL file hash drifted');
  invariant(canonicalIdl.address === canonical.address, 'canonical IDL file address drifted');
  invariant(equalArray(canonicalIdl.instructions.map(({ name }) => name), canonical.instruction_names),
    'canonical IDL instruction surface drifted');
  invariant(sha256(gitObject(canonical.recorded_at_commit, canonical.path)) === canonical.sha256,
    'recorded canonical IDL commit does not reproduce the canonical file');

  invariant(sha256(gitObject(source.commit, source.path)) === source.sha256,
    'verified source commit/path hash drifted');
  invariant(sha256(gitObject(source.commit, 'Cargo.lock')) === source.cargo_lock_sha256,
    'verified source Cargo.lock hash drifted');

  const pendingIdlBytes = readFileSync(resolve(root, pending.idl_path));
  invariant(sha256(pendingIdlBytes) === pending.idl_sha256, 'pending source-head IDL hash drifted');
  invariant(pending.idl_sha256 !== canonical.sha256,
    'pending source-head IDL must not silently replace deployed canonical truth');
  return true;
}

async function fetchLive(manifest) {
  const { Connection, PublicKey, clusterApiUrl } = await import('@solana/web3.js');
  const program = manifest.program;
  const published = manifest.published_idl;
  const loader = new PublicKey(loaderId);
  const programId = new PublicKey(program.program_id);
  const idlAddress = new PublicKey(published.account);
  const rpcUrl = process.env.ESCROW_V3_RPC_URL_MAINNET_BETA || clusterApiUrl('mainnet-beta');
  const connection = new Connection(rpcUrl, 'confirmed');

  const programAccount = await connection.getAccountInfo(programId, 'confirmed');
  invariant(programAccount, `program account ${program.program_id} not found`);
  invariant(programAccount.owner.equals(loader), 'program owner drifted');
  invariant(programAccount.data.length === 36 && programAccount.data.readUInt32LE(0) === programStateTag,
    'program account is not upgradeable');
  const programDataAddress = new PublicKey(programAccount.data.subarray(4, 36));
  invariant(programDataAddress.toBase58() === program.program_data, 'ProgramData address drifted');

  const response = await connection.getMultipleAccountsInfoAndContext([programDataAddress, idlAddress], 'confirmed');
  const [programDataAccount, idlAccount] = response.value;
  invariant(programDataAccount && idlAccount, 'ProgramData or published IDL account missing');
  invariant(programDataAccount.owner.equals(loader), 'ProgramData owner drifted');
  invariant(programDataAccount.data.readUInt32LE(0) === programDataStateTag, 'ProgramData tag drifted');
  invariant(programDataAccount.data.length === program.program_data_account_bytes, 'ProgramData length drifted');
  invariant(Number(programDataAccount.data.readBigUInt64LE(4)) === program.upgrade_slot, 'deployed slot drifted');

  const allocated = programDataAccount.data.subarray(programDataHeaderBytes);
  let trailingZeroBytes = 0;
  while (trailingZeroBytes < allocated.length && allocated[allocated.length - trailingZeroBytes - 1] === 0) {
    trailingZeroBytes += 1;
  }
  const trimmed = allocated.subarray(0, allocated.length - trailingZeroBytes);
  invariant(allocated.length === program.allocated_payload_bytes, 'allocated payload length drifted');
  invariant(sha256(allocated) === program.allocated_payload_sha256, 'allocated payload hash drifted');
  invariant(trailingZeroBytes === program.trailing_zero_bytes, 'trailing zero count drifted');
  invariant(trimmed.length === program.trimmed_payload_bytes, 'trimmed payload length drifted');
  invariant(sha256(trimmed) === program.trimmed_payload_sha256, 'trimmed payload hash drifted');

  invariant(idlAccount.owner.equals(programId), 'published IDL owner drifted');
  invariant(idlAccount.data.length === published.account_bytes, 'published IDL account length drifted');
  const compressedLength = idlAccount.data.readUInt32LE(40);
  const inflated = inflateSync(idlAccount.data.subarray(44, 44 + compressedLength));
  const idl = JSON.parse(inflated.toString('utf8'));
  const instructionNames = idl.instructions.map(({ name }) => name).sort();
  invariant(inflated.length === published.inflated_json_bytes, 'published IDL inflated length drifted');
  invariant(sha256(inflated) === published.inflated_json_sha256, 'published IDL hash drifted');
  invariant(equalArray(instructionNames, published.instruction_names), 'published IDL instructions drifted');

  const artifactPath = process.env.ESCROW_V3_DEPLOYED_SOURCE_ARTIFACT;
  if (artifactPath) {
    invariant(existsSync(artifactPath), `source artifact missing: ${artifactPath}`);
    const artifact = readFileSync(artifactPath);
    invariant(artifact.length === allocated.length, 'source artifact length differs from deployed payload');
    invariant(sha256(artifact) === sha256(allocated), 'source artifact differs from deployed payload');
  }

  return {
    rpc_slot: response.context.slot,
    upgrade_slot: Number(programDataAccount.data.readBigUInt64LE(4)),
    allocated_payload_sha256: sha256(allocated),
    source_artifact_compared: Boolean(artifactPath),
    published_idl_sha256: sha256(inflated),
    published_idl_instruction_count: instructionNames.length,
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
    source_binary_verdict: manifest.verified_source.verdict,
    canonical_idl_instructions: manifest.canonical_idl.instruction_count,
    published_idl_instructions: manifest.published_idl.instruction_count,
    fee_routing_status: manifest.pending_source_head.status,
    rider_packet: manifest.pending_source_head.rider_packet,
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

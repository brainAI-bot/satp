#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`escrow_v3 fee-routing extension: ${message}`);
}

function readPinned(commit, relativePath) {
  return execFileSync('git', ['show', `${commit}:${relativePath}`], {
    cwd: root,
    encoding: null,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function deriveZeroExtendedPayload(currentPayload, additionalProgramBytes) {
  if (!Buffer.isBuffer(currentPayload)) fail('derivation payload must be a Buffer');
  if (!Number.isSafeInteger(additionalProgramBytes) || additionalProgramBytes <= 0) {
    fail('derivation additional bytes must be a positive safe integer');
  }
  const zeroSuffix = Buffer.alloc(additionalProgramBytes);
  const extendedPayload = Buffer.concat([currentPayload, zeroSuffix]);
  if (!extendedPayload.subarray(0, currentPayload.length).equals(currentPayload)) {
    fail('derivation changed the existing payload prefix');
  }
  if (extendedPayload.subarray(currentPayload.length).some((byte) => byte !== 0)) {
    fail('derivation produced a non-zero extension suffix');
  }
  return {
    extendedPayload,
    payloadSha256: sha256(extendedPayload),
    prefixSha256: sha256(currentPayload),
    zeroSuffixBytes: zeroSuffix.length,
  };
}

export function verifyFeeRoutingExtension() {
  const extension = JSON.parse(readFileSync(
    resolve(root, 'docs/escrow-v3-fee-routing-extension-011685d4.json'),
    'utf8',
  ));
  const candidate = JSON.parse(readFileSync(resolve(root, extension.candidate_manifest), 'utf8'));
  const packet = readFileSync(resolve(root, extension.change_control_packet), 'utf8');
  const source = readPinned(candidate.source.commit, candidate.source.path);
  const cargoLock = readPinned(candidate.source.commit, candidate.source.cargo_lock_path);
  const idlBytes = readPinned(candidate.idl.commit, candidate.idl.path);
  const idl = JSON.parse(idlBytes.toString('utf8'));

  if (sha256(source) !== candidate.source.sha256) fail('pinned source hash mismatch');
  if (sha256(cargoLock) !== candidate.source.cargo_lock_sha256) fail('pinned Cargo.lock hash mismatch');
  if (sha256(idlBytes) !== candidate.idl.sha256) fail('pinned IDL hash mismatch');
  if (extension.reproducibility.source_commit !== candidate.source.commit) fail('reproducibility source commit drift');
  if (extension.reproducibility.expected_artifact_bytes !== candidate.build.artifact_bytes) fail('candidate byte count drift');
  if (extension.reproducibility.expected_artifact_sha256 !== candidate.build.artifact_sha256) fail('candidate artifact hash drift');
  if (extension.reproducibility.expected_idl_sha256 !== candidate.idl.sha256) fail('candidate IDL hash drift');
  if (extension.reproducibility.required_distinct_clean_hosts !== 2) fail('two clean build hosts are mandatory');
  const attestations = extension.reproducibility.recorded_attestations;
  if (!Array.isArray(attestations) || attestations.length !== 2) fail('exactly two build attestations are required');
  if (new Set(attestations.map((entry) => entry.host_identity)).size !== 2) fail('build hosts are not distinct');
  for (const attestation of attestations) {
    if (!attestation.host_identity || attestation.status !== 'reproduced') fail('build attestation is incomplete');
    if (attestation.clean_checkout_commit !== candidate.source.commit) fail('attestation source commit drift');
    if (attestation.source_sha256 !== candidate.source.sha256) fail('attestation source hash drift');
    if (attestation.cargo_lock_sha256 !== candidate.source.cargo_lock_sha256) fail('attestation Cargo.lock hash drift');
    if (attestation.build_command !== candidate.build.command) fail('attestation build command drift');
    if (attestation.artifact_bytes !== candidate.build.artifact_bytes) fail('attestation artifact size drift');
    if (attestation.artifact_sha256 !== candidate.build.artifact_sha256) fail('attestation artifact hash drift');
    if (attestation.idl_sha256 !== candidate.idl.sha256) fail('attestation IDL hash drift');
    if (!/^[0-9a-f]{64}$/.test(attestation.log_sha256)) fail('attestation build-log hash missing');
    for (const [tool, version] of Object.entries(candidate.toolchain)) {
      if (attestation.tool_versions?.[tool] !== version) fail(`attestation ${tool} version drift`);
    }
  }

  const allocation = extension.allocation;
  if (allocation.current_payload_bytes !== candidate.programdata_capacity.allocated_payload_bytes) fail('current allocation drift');
  if (allocation.candidate_artifact_bytes !== candidate.build.artifact_bytes) fail('allocation candidate bytes drift');
  if (allocation.candidate_overrun_bytes !== allocation.candidate_artifact_bytes - allocation.current_payload_bytes) fail('candidate overrun math mismatch');
  if (allocation.candidate_overrun_bytes !== candidate.programdata_capacity.candidate_overrun_bytes) fail('candidate overrun drift');
  if (allocation.loader_minimum_additional_bytes !== 10240) fail('loader minimum must be 10240 bytes');
  if (allocation.loader_minimum_additional_bytes !== candidate.programdata_capacity.loader_minimum_additional_bytes) fail('loader minimum drift');
  if (allocation.loader_minimum_feature_id !== candidate.programdata_capacity.loader_minimum_feature_id) fail('loader minimum feature id drift');
  if (allocation.loader_minimum_feature_activation_slot !== candidate.programdata_capacity.loader_minimum_feature_activation_slot) fail('loader minimum activation slot drift');
  if (!Number.isSafeInteger(allocation.loader_minimum_feature_observed_finalized_slot)
      || allocation.loader_minimum_feature_observed_finalized_slot < allocation.loader_minimum_feature_activation_slot) {
    fail('loader minimum feature observation predates activation');
  }
  if (allocation.loader_minimum_feature_source !== 'https://github.com/anza-xyz/agave/blob/a4144392c8ffd8d0840e312ecc3a59d35533c005/feature-set/src/lib.rs#L1471-L1473') fail('loader minimum feature source is not pinned');
  if (allocation.loader_minimum_enforcement_source !== 'https://github.com/anza-xyz/agave/blob/a4144392c8ffd8d0840e312ecc3a59d35533c005/programs/bpf_loader/src/lib.rs#L873-L895') fail('loader minimum enforcement source is not pinned');
  if (allocation.additional_program_bytes !== Math.max(allocation.candidate_overrun_bytes, allocation.loader_minimum_additional_bytes)) fail('extension does not satisfy loader minimum');
  if (allocation.additional_program_bytes !== candidate.programdata_capacity.required_extension_bytes) fail('required extension drift');
  if (allocation.target_payload_bytes !== allocation.current_payload_bytes + allocation.additional_program_bytes) fail('target allocation math mismatch');
  if (allocation.target_payload_bytes !== candidate.programdata_capacity.target_allocated_payload_bytes) fail('target allocation drift');
  if (allocation.candidate_zero_padding_bytes !== allocation.target_payload_bytes - allocation.candidate_artifact_bytes) fail('candidate padding math mismatch');
  if (allocation.candidate_zero_padding_bytes !== candidate.programdata_capacity.candidate_zero_padding_bytes) fail('candidate padding drift');
  if (allocation.target_account_bytes !== allocation.target_payload_bytes + allocation.programdata_header_bytes) fail('account length math mismatch');
  if (allocation.observed_target_rent_exempt_lamports - allocation.observed_current_lamports
      !== allocation.observed_rent_top_up_lamports) fail('observed rent top-up math mismatch');
  if (allocation.rent_top_up_lamports_cap !== allocation.observed_rent_top_up_lamports) fail('rent top-up cap must equal observed delta');
  if (!Number.isSafeInteger(allocation.extension_transaction_fee_lamports_cap)
      || allocation.extension_transaction_fee_lamports_cap <= 0) fail('extension transaction fee cap is invalid');
  if (allocation.extension_total_lamport_debit_cap
      !== allocation.rent_top_up_lamports_cap + allocation.extension_transaction_fee_lamports_cap) {
    fail('extension total debit cap math mismatch');
  }
  if (allocation.observed_finalized_slot <= 0
      || allocation.observation_status !== 'read_only_snapshot_reconfirm_before_owner_approval') {
    fail('read-only allocation observation is not fail-closed');
  }
  if (allocation.extension_transaction_limit !== 1 || allocation.retry_limit !== 0) fail('extension must be one submission with no retry');
  if (allocation.post_extension_zero_suffix_bytes !== allocation.additional_program_bytes) fail('zero suffix length mismatch');
  if (allocation.post_extension_prefix_bytes !== allocation.current_payload_bytes) fail('post-extension prefix length mismatch');
  if (!/^[0-9a-f]{64}$/.test(allocation.post_extension_prefix_sha256)) fail('post-extension prefix hash missing');
  if (!/^[0-9a-f]{64}$/.test(allocation.post_extension_payload_sha256)) fail('post-extension payload hash missing');
  if (allocation.post_deploy_artifact_bytes !== candidate.build.artifact_bytes
      || allocation.post_deploy_artifact_sha256 !== candidate.build.artifact_sha256) fail('post-deploy artifact drift');
  if (allocation.post_deploy_zero_suffix_bytes !== allocation.candidate_zero_padding_bytes) fail('post-deploy suffix length mismatch');
  if (allocation.deploy_auto_extend !== false) fail('deploy must disable auto-extension');

  const expectedRoutes = new Map(extension.route_proof.routes.map((route) => [route.name, route]));
  if (extension.route_proof.aggregate_transaction_limit !== 2 || extension.route_proof.retry_limit !== 0) {
    fail('route proof must allow exactly two submissions and no retry');
  }
  for (const name of ['release', 'partial_release']) {
    const route = expectedRoutes.get(name);
    const instruction = idl.instructions.find((entry) => entry.name === name);
    if (!route || !instruction) fail(`missing ${name} route`);
    const discriminator = Buffer.from(instruction.discriminator).toString('hex');
    const accounts = instruction.accounts.map((account) => account.name);
    if (route.instruction_discriminator_hex !== discriminator) fail(`${name} discriminator drift`);
    if (JSON.stringify(route.ordered_accounts) !== JSON.stringify(accounts)) fail(`${name} account order drift`);
    if (route.required_submissions !== 1 || route.status !== 'not_executed') fail(`${name} proof must remain unexecuted until approval`);
  }

  const eventDiscriminator = sha256(Buffer.from('event:PlatformFeeRouted')).slice(0, 16);
  if (extension.route_proof.platform_fee_event_discriminator_hex !== eventDiscriminator) fail('fee event discriminator drift');
  if (!packet.includes('ADDITIONAL_PROGRAM_BYTES="$((TARGET_PROGRAMDATA_PAYLOAD_BYTES - PROGRAMDATA_PAYLOAD_BYTES))"')) {
    fail('packet lacks calculated extension bound');
  }
  if (!packet.includes('test "$ADDITIONAL_PROGRAM_BYTES" = \'10240\'')) fail('packet lacks loader-minimum extension assertion');
  if (!packet.includes('test "$PROGRAMDATA_RENT_TOP_UP_LAMPORTS" = \'71270400\'')) fail('packet lacks exact rent assertion');
  if (!packet.includes('test "$TOTAL_EXTENSION_DEBIT_CAP_LAMPORTS" = \'71280400\'')) fail('packet lacks total debit cap assertion');
  if (!packet.includes('--no-auto-extend --max-len "$TARGET_PROGRAMDATA_PAYLOAD_BYTES"')) fail('packet does not disable deploy auto-extension');
  if (!packet.includes('fdf90fce1c7fc1f1') || !packet.includes('140465f53583d508')) fail('packet lacks route discriminators');
  if (!packet.includes('f81b63224f0de0cf')) fail('packet lacks fee-event discriminator');

  return {
    ok: true,
    source_commit: candidate.source.commit,
    artifact_sha256: candidate.build.artifact_sha256,
    artifact_bytes: candidate.build.artifact_bytes,
    required_distinct_clean_hosts: extension.reproducibility.required_distinct_clean_hosts,
    reproduced_host_identities: attestations.map((entry) => entry.host_identity),
    additional_program_bytes: allocation.additional_program_bytes,
    target_payload_bytes: allocation.target_payload_bytes,
    route_names: [...expectedRoutes.keys()],
  };
}

async function rpcCall(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) fail(`live RPC ${method} HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) fail(`live RPC ${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

export async function verifyLiveFeeRoutingExtension(rpcUrl = 'https://api.mainnet-beta.solana.com') {
  const offline = verifyFeeRoutingExtension();
  const extension = JSON.parse(readFileSync(
    resolve(root, 'docs/escrow-v3-fee-routing-extension-011685d4.json'),
    'utf8',
  ));
  const allocation = extension.allocation;
  const program = JSON.parse(execFileSync('solana', [
    'program', 'show', extension.program.program_id,
    '--url', rpcUrl, '--commitment', 'finalized', '--output', 'json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  if (program.programdataAddress !== extension.program.program_data) fail('live ProgramData address drift');
  if (program.authority !== extension.program.upgrade_authority) fail('live upgrade authority drift');
  if (program.dataLen !== allocation.current_payload_bytes) fail('live payload allocation drift');
  if (program.lamports !== allocation.observed_current_lamports) fail('live ProgramData lamports drift');

  const accountResult = await rpcCall(rpcUrl, 'getAccountInfo', [
    extension.program.program_data,
    { encoding: 'base64', commitment: 'finalized' },
  ]);
  if (!accountResult.value) fail('live ProgramData account missing');
  if (accountResult.value.owner !== 'BPFLoaderUpgradeab1e11111111111111111111111') fail('live ProgramData owner drift');
  const account = Buffer.from(accountResult.value.data[0], 'base64');
  if (account.length !== allocation.current_payload_bytes + allocation.programdata_header_bytes) fail('live ProgramData account length drift');
  const payload = account.subarray(allocation.programdata_header_bytes);
  const derivedPayload = deriveZeroExtendedPayload(payload, allocation.additional_program_bytes);
  if (derivedPayload.prefixSha256 !== allocation.post_extension_prefix_sha256) fail('live current payload hash drift');
  if (derivedPayload.zeroSuffixBytes !== allocation.post_extension_zero_suffix_bytes) fail('live derived suffix drift');
  if (derivedPayload.extendedPayload.length !== allocation.target_payload_bytes) fail('live derived allocation drift');
  if (derivedPayload.payloadSha256 !== allocation.post_extension_payload_sha256) fail('live derived payload hash drift');

  const featureResult = await rpcCall(rpcUrl, 'getAccountInfo', [
    allocation.loader_minimum_feature_id,
    { encoding: 'base64', commitment: 'finalized' },
  ]);
  if (!featureResult.value) fail('loader minimum feature account missing');
  if (featureResult.value.owner !== 'Feature111111111111111111111111111111111111') fail('loader minimum feature owner drift');
  const featureData = Buffer.from(featureResult.value.data[0], 'base64');
  if (featureData.length !== 9 || featureData[0] !== 1) fail('loader minimum feature is not active');
  const featureActivationSlot = Number(featureData.readBigUInt64LE(1));
  if (featureActivationSlot !== allocation.loader_minimum_feature_activation_slot) fail('loader minimum feature activation slot drift');
  if (featureResult.context.slot < allocation.loader_minimum_feature_observed_finalized_slot) fail('loader minimum feature observation slot regressed');

  const targetRent = await rpcCall(rpcUrl, 'getMinimumBalanceForRentExemption', [
    allocation.target_account_bytes,
    { commitment: 'finalized' },
  ]);
  if (targetRent !== allocation.observed_target_rent_exempt_lamports) fail('live target rent drift');
  if (targetRent - accountResult.value.lamports !== allocation.observed_rent_top_up_lamports) fail('live rent delta drift');
  return {
    ...offline,
    live_read_only: true,
    finalized_slot: accountResult.context.slot,
    current_lamports: accountResult.value.lamports,
    target_rent_exempt_lamports: targetRent,
    rent_top_up_lamports: targetRent - accountResult.value.lamports,
    loader_minimum_feature_activation_slot: featureActivationSlot,
    locally_derived_post_extension_payload_sha256: derivedPayload.payloadSha256,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const rpcArg = process.argv.find((arg) => arg.startsWith('--rpc-url='));
    const result = process.argv.includes('--live')
      ? await verifyLiveFeeRoutingExtension(rpcArg?.slice('--rpc-url='.length))
      : verifyFeeRoutingExtension();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

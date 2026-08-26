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
  if (allocation.additional_program_bytes !== allocation.candidate_artifact_bytes - allocation.current_payload_bytes) {
    fail('additional bytes are not the exact candidate overrun');
  }
  if (allocation.additional_program_bytes !== candidate.programdata_capacity.required_extension_bytes) fail('required extension drift');
  if (allocation.target_payload_bytes !== allocation.candidate_artifact_bytes) fail('target allocation must equal candidate bytes');
  if (allocation.target_account_bytes !== allocation.target_payload_bytes + allocation.programdata_header_bytes) fail('account length math mismatch');
  if (allocation.observed_target_rent_exempt_lamports - allocation.observed_current_lamports
      !== allocation.observed_rent_top_up_lamports) fail('observed rent top-up math mismatch');
  if (allocation.observed_finalized_slot <= 0
      || allocation.observation_status !== 'read_only_snapshot_reconfirm_before_owner_approval') {
    fail('read-only allocation observation is not fail-closed');
  }
  if (allocation.extension_transaction_limit !== 1 || allocation.retry_limit !== 0) fail('extension must be one submission with no retry');
  if (allocation.post_extension_zero_suffix_bytes !== allocation.additional_program_bytes) fail('zero suffix length mismatch');
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
  if (!packet.includes('test "$ADDITIONAL_PROGRAM_BYTES" = \'3448\'')) fail('packet lacks exact extension assertion');
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(verifyFeeRoutingExtension(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

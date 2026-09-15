import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { PublicKey } from '@solana/web3.js';
import {
  decodeProgramMetadata,
  validateDeployedTruth,
} from '../scripts/verify-escrow-v3-deployed-truth.mjs';

const manifest = JSON.parse(readFileSync(
  new URL('../docs/escrow-v3-deployed-truth.json', import.meta.url),
  'utf8'
));
const deployedTruthWorkflow = readFileSync(
  new URL('../.github/workflows/escrow-v3-deployed-truth.yml', import.meta.url),
  'utf8'
);
const deployedSourceBuildScript = readFileSync(
  new URL('../scripts/build-verify-escrow-v3-deployed-source.sh', import.meta.url),
  'utf8'
);

const mutate = (callback) => {
  const copy = structuredClone(manifest);
  callback(copy);
  return copy;
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const canonicalIdlBytes = readFileSync(new URL('../idls/v3/escrow_v3.json', import.meta.url));

function programMetadataAccount(content, paddingBytes = 0) {
  const compressed = deflateSync(content);
  const data = Buffer.alloc(96 + compressed.length + paddingBytes);
  data[0] = 2;
  new PublicKey(manifest.program.program_id).toBuffer().copy(data, 1);
  data[65] = 1;
  data[66] = 1;
  data.write(manifest.program_metadata_idl.seed, 67, 'utf8');
  data[83] = 1;
  data[84] = 2;
  data[85] = 1;
  data[86] = 0;
  data.writeUInt32LE(compressed.length, 87);
  compressed.copy(data, 96);
  return data;
}

test('scheduled deployed-source proof propagates a failed build through tee', () => {
  const proofStep = deployedTruthWorkflow.slice(
    deployedTruthWorkflow.indexOf('- name: Rebuild recorded source and compare live ProgramData'),
    deployedTruthWorkflow.indexOf('- name: Upload comparison artifact')
  );
  assert.match(proofStep, /set -euo pipefail/u);
  assert.match(proofStep, /build-verify-escrow-v3-deployed-source\.sh[\s\\]*\| tee/u);
});

test('deployed-source build prepares the Solana platform-tools cache before build-sbf', () => {
  const cachePreparation = deployedSourceBuildScript.indexOf('mkdir -p "$HOME/.cache/solana"');
  const build = deployedSourceBuildScript.indexOf('cargo build-sbf');
  assert.notEqual(cachePreparation, -1);
  assert.ok(cachePreparation < build);
});

test('accepts verified source with canonical Program Metadata and stale legacy Anchor IDL', () => {
  assert.equal(validateDeployedTruth(manifest), true);
});

test('accepts variable Program Metadata allocation when decoded content is canonical', () => {
  const decoded = decodeProgramMetadata(
    programMetadataAccount(canonicalIdlBytes, 256),
    manifest.program_metadata_idl,
    canonicalIdlBytes,
    manifest.program.program_id,
    PublicKey,
  );
  assert.equal(decoded.allocationPaddingBytes, 256);
  assert.equal(decoded.content.equals(canonicalIdlBytes), true);
});

test('rejects Program Metadata allocation whose decoded content differs from canonical', () => {
  const drifted = Buffer.from(canonicalIdlBytes);
  drifted[drifted.indexOf(Buffer.from('escrow_v3'))] = 'E'.charCodeAt(0);
  assert.throws(() => decodeProgramMetadata(
    programMetadataAccount(drifted, 256),
    manifest.program_metadata_idl,
    canonicalIdlBytes,
    manifest.program.program_id,
    PublicKey,
  ), /decoded IDL differs from the canonical repo IDL/);
});

test('rejects non-zero bytes after declared Program Metadata content', () => {
  const account = programMetadataAccount(canonicalIdlBytes, 8);
  account[account.length - 1] = 1;
  assert.throws(() => decodeProgramMetadata(
    account,
    manifest.program_metadata_idl,
    canonicalIdlBytes,
    manifest.program.program_id,
    PublicKey,
  ), /allocation contains non-zero bytes/);
});

test('keeps the canonical IDL proof pinned to a reachable external commit', () => {
  assert.equal(
    manifest.canonical_idl.recorded_commit_reachability,
    'reachable_mainline_ancestor'
  );
  assert.equal(
    manifest.canonical_idl.recorded_at_commit,
    '614881a2971c924cd06cde9d9dfadaaf292f233d'
  );
  const recordedBytes = execFileSync('git', [
    'show',
    `${manifest.canonical_idl.recorded_at_commit}:${manifest.canonical_idl.path}`,
  ]);
  const canonicalBytes = readFileSync(new URL(`../${manifest.canonical_idl.path}`, import.meta.url));
  assert.equal(sha256(recordedBytes), manifest.canonical_idl.sha256);
  assert.deepEqual(recordedBytes, canonicalBytes);
});

test('rejects a fake canonical IDL provenance commit', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.canonical_idl.recorded_at_commit = 'f'.repeat(40);
  })), /recorded_at_commit must resolve to a commit/);
});

test('rejects the current tree as the canonical IDL provenance commit', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD']).toString('utf8').trim();
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.canonical_idl.recorded_at_commit = head;
  })), /must be an external commit/);
});

test('rejects a source artifact hash that differs from deployed payload', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.verified_source.artifact_sha256 = '0'.repeat(64);
  })), /artifact hash must equal deployed/);
});

test('rejects hiding a Program Metadata canonical-content mismatch behind status', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program_metadata_idl.status = 'instruction_names_match_account_schema_delta_fail_closed';
  })), /canonical decoded content/);
});

test('rejects Program Metadata instruction drift from the verified-source IDL', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program_metadata_idl.instruction_names = copy.program_metadata_idl.instruction_names
      .filter((name) => name !== 'release_usdc');
    copy.program_metadata_idl.instruction_count = copy.program_metadata_idl.instruction_names.length;
  })), /Program Metadata IDL must contain 14 instructions/);
});

test('rejects inventing a Program Metadata release treasury account delta', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program_metadata_idl.repo_idl_account_surface_delta.release = ['treasury'];
  })), /recorded account delta drifted/);
});

test('rejects claiming Program Metadata fee-routing schemas do not match the repo IDL', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.conclusion.program_metadata_fee_routing_account_schema_matches_canonical_repo_idl = false;
  })), /account schema match must be explicit/);
});

test('rejects treating the legacy Anchor IDL as canonical', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.conclusion.legacy_anchor_idl_is_canonical_read_path = true;
  })), /legacy Anchor IDL must not be represented as canonical/);
});

test('rejects hiding the deployed fee-routing runtime', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.conclusion.fee_routing_is_deployed = false;
  })), /deployed fee routing must remain explicit/);
});

test('rejects non-zero allocation padding claims', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.program.allocation_padding_sha256 = '0'.repeat(64);
  })), /all-zero suffix hash/);
});

test('rejects keeping consumers gated after canonical Program Metadata reconciliation', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.conclusion.consumer_escrow_unpause_ready = false;
  })), /readiness must reflect canonical Program Metadata content/);
});

test('rejects a mutation-authorizing packet', () => {
  assert.throws(() => validateDeployedTruth(mutate((copy) => {
    copy.safety.solana_write = true;
  })), /mutation safety flags/);
});

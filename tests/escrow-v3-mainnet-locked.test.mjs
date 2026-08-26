import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readAnchorIdlAuthority } from '../scripts/read-anchor-idl-authority.mjs';
import { verifyFeeRoutingExtension } from '../scripts/verify-escrow-v3-fee-routing-extension.mjs';
import { verifyLockedBuild } from '../scripts/verify-escrow-v3-mainnet-locked.mjs';

test('locked escrow_v3 mainnet inputs and 14-instruction IDL are internally consistent', () => {
  const result = verifyLockedBuild();
  assert.equal(result.ok, true);
  assert.equal(result.source_commit, '0bf088e5618f173dff7e0fba622bc2911212c52e');
  assert.equal(result.artifact_sha256, null);
  assert.equal(result.idl_address, 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C');
  assert.equal(result.instruction_count, 14);
});

test('fee-routing candidate is separate from the deployed locked-build record', () => {
  const locked = JSON.parse(readFileSync(
    new URL('../docs/escrow-v3-mainnet-locked-build.json', import.meta.url),
    'utf8',
  ));
  const candidate = JSON.parse(readFileSync(
    new URL('../docs/escrow-v3-fee-routing-candidate-011685d4.json', import.meta.url),
    'utf8',
  ));
  const packet = readFileSync(new URL(`../${candidate.change_control_packet}`, import.meta.url), 'utf8');

  assert.equal(locked.status, 'owner_signing_pending');
  assert.equal(locked.source.commit, '0bf088e5618f173dff7e0fba622bc2911212c52e');
  assert.equal(locked.idl.commit, '008464206ff89f0012cbf071335dd59c3d4bd1b8');
  assert.equal(locked.build.artifact_sha256, '4f21da13659cbe99a606b408a5f1d3523c0e41de20538028939bbb1b54c3cc0d');
  assert.equal(locked.signing_packet, 'docs/escrow-v3-mainnet-signing-packet.md');
  assert.equal(candidate.status, 'independent_review_pending');
  assert.equal(candidate.source.commit, '3f8188bec89db0d4a081931f35272e10185d1c0d');
  assert.equal(candidate.idl.commit, candidate.source.commit);
  assert.equal(candidate.build.artifact_bytes, 350304);
  assert.equal(candidate.programdata_capacity.required_extension_bytes, 3448);
  assert.equal(candidate.programdata_capacity.status, 'extension_required_before_buffer_write');
  assert.equal(candidate.extension_packet, 'docs/escrow-v3-fee-routing-extension-011685d4.json');
  assert.equal(candidate.candidate_head, candidate.source.commit);
  assert.equal(candidate.reviewed_head, null);
  assert.notEqual(candidate.source.commit, locked.source.commit);
  assert.match(packet, /NO-GO until exact-head independent review, green checks/);
  assert.match(packet, /Two-host candidate reproducibility is complete/);
  assert.match(packet, /Transaction A calls `release` once/);
  assert.match(packet, /Transaction B calls `partial_release` once/);
  assert.match(packet, /Stop after two submissions regardless of\s+outcome/);
  assert.match(packet, /platform_fee = floor\(gross \* 500 \/ 10000\)/);
  assert.match(packet, /wrong treasury fails before\s+state or balance mutation/);
  assert.match(packet, /USDC settlement is explicitly unchanged/);
  assert.match(packet, /performed no chain\s+write, signing, keypair access, money\s+movement/);
});

test('fee-routing extension is exactly bounded and route proofs are IDL-bound', () => {
  const result = verifyFeeRoutingExtension();

  assert.equal(result.ok, true);
  assert.equal(result.source_commit, '3f8188bec89db0d4a081931f35272e10185d1c0d');
  assert.equal(result.artifact_bytes, 350304);
  assert.equal(result.artifact_sha256, '27395415b6dc3d069d8a0a974613e647af1494590cbaff0a2658945a2bc4784a');
  assert.equal(result.required_distinct_clean_hosts, 2);
  assert.deepEqual(result.reproduced_host_identities, [
    'brainchain-mac-mini/darwin-arm64/macos-26.4',
    'github-actions/macos-26/run-32916499013/attempt-1',
  ]);
  assert.equal(result.additional_program_bytes, 3448);
  assert.equal(result.target_payload_bytes, 350304);
  assert.deepEqual(result.route_names, ['release', 'partial_release']);
});

test('owner packet fails closed on ProgramData and IDL capacity before writes', () => {
  const packet = readFileSync(new URL('../docs/escrow-v3-mainnet-signing-packet.md', import.meta.url), 'utf8');

  assert.match(packet, /PROGRAMDATA_PAYLOAD_BYTES=.*\.dataLen/);
  assert.match(packet, /test "\$PROGRAMDATA_PAYLOAD_BYTES" = '346856'/);
  assert.match(packet, /test "\$PROGRAMDATA_PAYLOAD_BYTES" -gt 346856/);
  assert.match(packet, /extension required; stop before buffer writes/);
  assert.match(packet, /IDL_ACCOUNT_BYTES=.*\.result\.value\.space/);
  assert.match(packet, /test "\$LOCKED_IDL_ZLIB_BYTES" -le "\$\(\(IDL_ACCOUNT_BYTES - 44\)\)"/);
  assert.match(packet, /solana program extend HXCUWKR2/);
  assert.match(packet, /head -c 346856 post-upgrade-allocated-payload\.bin/);
  assert.match(packet, /test ! -s post-upgrade-nonzero-padding\.bin/);
  assert.doesNotMatch(packet, /^anchor idl authority /m);
  assert.match(packet, /read-anchor-idl-authority\.mjs/);
});

test('Anchor 1.0 IDL authority readback decodes the legacy account header', () => {
  const account = Buffer.alloc(44);
  const response = { result: { value: { data: [account.toString('base64'), 'base64'] } } };
  assert.equal(readAnchorIdlAuthority(response), '11111111111111111111111111111111');
  assert.throws(
    () => readAnchorIdlAuthority({ result: { value: { data: [Buffer.alloc(43).toString('base64')] } } }),
    /expected at least 44/
  );
});

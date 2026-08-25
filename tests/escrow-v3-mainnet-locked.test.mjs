import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readAnchorIdlAuthority } from '../scripts/read-anchor-idl-authority.mjs';
import { verifyLockedBuild } from '../scripts/verify-escrow-v3-mainnet-locked.mjs';

test('locked escrow_v3 mainnet inputs and 14-instruction IDL are internally consistent', () => {
  const result = verifyLockedBuild();
  assert.equal(result.ok, true);
  assert.equal(result.idl_address, 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C');
  assert.equal(result.instruction_count, 14);
});

test('fee-routing candidate packet remains approval-gated and binds two validations', () => {
  const manifest = JSON.parse(readFileSync(
    new URL('../docs/escrow-v3-mainnet-locked-build.json', import.meta.url),
    'utf8',
  ));
  const packet = readFileSync(new URL(`../${manifest.signing_packet}`, import.meta.url), 'utf8');

  assert.equal(manifest.status, 'independent_review_pending');
  assert.equal(manifest.source.commit, '2930ca34bb36cc419f64b45cf2367896a93c19c5');
  assert.equal(manifest.build.artifact_bytes, 345744);
  assert.match(packet, /NO-GO until exact-head independent review, green checks/);
  assert.match(packet, /Transaction A calls `release` once/);
  assert.match(packet, /Transaction B calls `partial_release` once/);
  assert.match(packet, /Stop after two submissions regardless of outcome/);
  assert.match(packet, /platform_fee = floor\(gross \* 500 \/ 10000\)/);
  assert.match(packet, /wrong treasury fails before\s+state or balance mutation/);
  assert.match(packet, /USDC settlement is explicitly unchanged/);
  assert.match(packet, /performed no chain\s+write, signing, keypair access, money movement/);
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

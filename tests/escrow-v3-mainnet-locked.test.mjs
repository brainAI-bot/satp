import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { verifyLockedBuild } from '../scripts/verify-escrow-v3-mainnet-locked.mjs';

test('locked escrow_v3 mainnet inputs and 14-instruction IDL are internally consistent', () => {
  const result = verifyLockedBuild();
  assert.equal(result.ok, true);
  assert.equal(result.idl_address, 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C');
  assert.equal(result.instruction_count, 14);
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
});

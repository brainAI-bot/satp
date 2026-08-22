import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyLockedBuild } from '../scripts/verify-escrow-v3-mainnet-locked.mjs';

test('locked escrow_v3 mainnet inputs and 14-instruction IDL are internally consistent', () => {
  const result = verifyLockedBuild();
  assert.equal(result.ok, true);
  assert.equal(result.idl_address, 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C');
  assert.equal(result.instruction_count, 14);
});

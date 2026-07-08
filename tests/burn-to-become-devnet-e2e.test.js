#!/usr/bin/env node

const assert = require('assert');
const { execFileSync } = require('child_process');

const output = execFileSync(
  process.execPath,
  ['scripts/verify-burn-to-become-devnet-e2e.js', '--plan', '--offline', '--json'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
  }
);

const plan = JSON.parse(output);
const behaviors = new Set(plan.behaviors.map(behavior => behavior.name));

assert.equal(plan.marker, '[#fbc35f6e]');
assert.equal(plan.cluster, 'devnet');
assert.equal(plan.identityProgram, '7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ');
assert.equal(plan.mode, 'plan');
assert.ok(behaviors.has('free_mint_succeeds'));
assert.ok(behaviors.has('three_per_identity_cap_enforced_on_chain'));
assert.ok(behaviors.has('wallet_rotation_carries_cap_by_identity'));
assert.ok(behaviors.has('soulbound_transfer_fails'));
assert.match(plan.derivedAccounts.sampleGenesisPDA, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
assert.match(plan.derivedAccounts.sampleMintTrackerPDA, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
assert.equal(plan.approvalPacket.guardrails.includes('no mainnet write'), true);
assert.match(plan.approvalPacket.command, /SATP_DEVNET_E2E_APPROVED=1/);

console.log('burn-to-become devnet e2e plan test passed');


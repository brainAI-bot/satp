#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const idlPath = resolve(root, 'idls/satp_escrow.json');

const idl = JSON.parse(readFileSync(idlPath, 'utf8'));

const forbiddenProgramId = 'UpJ7jmUzHkQ7EdBKiBv3zq8Dr1fVh6GVWKa7nYtwQ22';
const expectedProgramId = 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C';
const expectedInstructions = [
  'cancel',
  'close_escrow',
  'create_escrow',
  'extend_deadline',
  'partial_release',
  'raise_dispute',
  'release',
  'resolve_dispute',
  'submit_work',
];
const expectedEvents = [
  'DeadlineExtended',
  'DisputeRaised',
  'DisputeResolved',
  'EscrowCancelled',
  'EscrowCreated',
  'EscrowReleased',
  'PartialRelease',
  'WorkSubmitted',
];
const expectedErrors = [
  'ZeroAmount',
  'DeadlinePassed',
  'AgentIdTooLong',
  'InvalidVerificationLevel',
  'InvalidIdentityOwner',
  'InvalidIdentityPda',
  'InvalidIdentityAccount',
  'AgentNotBorn',
  'InsufficientVerificationLevel',
  'NotActive',
  'NotReleasable',
  'NothingToRelease',
  'InsufficientFunds',
  'NotCancellable',
  'DeadlineNotReached',
  'NotDisputable',
  'NotDisputed',
  'NotCloseable',
  'NotArbiter',
  'Unauthorized',
  'WrongAgent',
  'ResolutionAmountMismatch',
  'ClientCannotBeArbiter',
  'AgentCannotBeArbiter',
  'NewDeadlineMustBeLater',
];
const expectedStatusVariants = [
  'Active',
  'Released',
  'Cancelled',
  'WorkSubmitted',
  'Disputed',
  'Resolved',
];

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function listNames(items) {
  return [...items.map((item) => item.name)].sort();
}

function assertList(label, actual, expected) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify([...expected].sort());
  if (actualText !== expectedText) {
    fail(`${label} mismatch: expected ${expectedText}, got ${actualText}`);
  }
}

if (idl.address !== expectedProgramId) fail(`IDL address mismatch: ${idl.address}`);
if (JSON.stringify(idl).includes(forbiddenProgramId)) fail('IDL still references dead UpJ7 escrow program');
if (idl.metadata?.name !== 'escrow_v3') fail(`IDL metadata.name mismatch: ${idl.metadata?.name}`);
if (idl.metadata?.version !== '0.1.0') fail(`IDL metadata.version mismatch: ${idl.metadata?.version}`);
if (idl.metadata?.spec !== '0.1.0') fail(`IDL metadata.spec mismatch: ${idl.metadata?.spec}`);

assertList('instructions', listNames(idl.instructions), expectedInstructions);

assertList('events', listNames(idl.events), expectedEvents);

assertList('errors', listNames(idl.errors), expectedErrors);

const escrowAccount = idl.accounts.find((account) => account.name === 'EscrowV3');
if (!escrowAccount) fail('missing EscrowV3 account entry');

const escrowType = idl.types.find((type) => type.name === 'EscrowV3');
if (!escrowType) fail('missing EscrowV3 account type');
assertList('Escrow fields', listNames(escrowType.type.fields), [
  'agent',
  'agent_id_hash',
  'amount',
  'arbiter',
  'bump',
  'client',
  'created_at',
  'deadline',
  'description_hash',
  'dispute_reason_hash',
  'disputed_at',
  'disputed_by',
  'min_verification_level',
  'nonce',
  'released_amount',
  'require_born',
  'status',
  'work_hash',
  'work_submitted_at',
]);

const statusType = idl.types.find((type) => type.name === 'EscrowStatus');
if (!statusType) fail('missing EscrowStatus type');
assertList('EscrowStatus variants', listNames(statusType.type.variants), expectedStatusVariants);

const idlStable = `${JSON.stringify(stable(idl))}\n`;
const idlRaw = readFileSync(idlPath);

console.log(JSON.stringify({
  ok: true,
  idl: relative(root, idlPath),
  idl_sha256: sha256(idlRaw),
  idl_stable_sha256: sha256(idlStable),
  program_id: expectedProgramId,
  instructions: expectedInstructions.length,
  events: expectedEvents.length,
  errors: expectedErrors.length,
}, null, 2));

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const idlPath = resolve(root, 'idls/satp_escrow.json');
const sourcePath = resolve(root, 'programs/satp_escrow/src/lib.rs');
const anchorPath = resolve(root, 'Anchor.toml');
const rustToolchainPath = resolve(root, 'rust-toolchain.toml');
const cargoPath = resolve(root, 'programs/satp_escrow/Cargo.toml');

const idl = JSON.parse(readFileSync(idlPath, 'utf8'));
const source = readFileSync(sourcePath, 'utf8');
const anchorToml = readFileSync(anchorPath, 'utf8');
const rustToolchain = readFileSync(rustToolchainPath, 'utf8');
const programCargo = readFileSync(cargoPath, 'utf8');

const expectedProgramId = 'UpJ7jmUzHkQ7EdBKiBv3zq8Dr1fVh6GVWKa7nYtwQ22';
const expectedInstructions = [
  'cancel',
  'close_escrow',
  'create_escrow',
  'raise_dispute',
  'release',
  'submit_work',
];
const expectedEvents = [
  'DisputeRaised',
  'EscrowCancelled',
  'EscrowCreated',
  'EscrowReleased',
  'WorkSubmitted',
];
const expectedErrors = [
  'ZeroAmount',
  'DeadlinePassed',
  'NotActive',
  'NotReleasable',
  'NotCancellable',
  'NotDisputable',
  'NotCloseable',
  'Unauthorized',
  'WrongAgent',
  'DeadlineNotReached',
];
const expectedStatusVariants = [
  'Active',
  'Released',
  'Cancelled',
  'WorkSubmitted',
  'Disputed',
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
if (!source.includes(`declare_id!("${expectedProgramId}")`)) fail('source declare_id does not match IDL address');
if (!anchorToml.includes(`satp_escrow = "${expectedProgramId}"`)) fail('Anchor.toml program id mismatch');
if (!rustToolchain.includes('channel = "1.86.0"')) fail('rust-toolchain lock mismatch');
if (!programCargo.includes('anchor-lang = "0.31.1"')) fail('program Cargo.toml anchor-lang lock mismatch');

assertList('instructions', listNames(idl.instructions), expectedInstructions);
for (const instruction of expectedInstructions) {
  if (!new RegExp(`pub fn ${instruction}\\s*\\(`).test(source)) {
    fail(`missing source instruction ${instruction}`);
  }
}

assertList('events', listNames(idl.events), expectedEvents);
for (const event of expectedEvents) {
  if (!new RegExp(`pub struct ${event}\\s*\\{`).test(source)) {
    fail(`missing source event ${event}`);
  }
}

assertList('errors', listNames(idl.errors), expectedErrors);
for (const errorName of expectedErrors) {
  if (!new RegExp(`\\b${errorName}\\s*,`).test(source)) {
    fail(`missing source error ${errorName}`);
  }
}

const escrowType = idl.types.find((type) => type.name === 'Escrow');
if (!escrowType) fail('missing Escrow account type');
assertList('Escrow fields', listNames(escrowType.type.fields), [
  'agent',
  'amount',
  'bump',
  'client',
  'created_at',
  'deadline',
  'description_hash',
  'status',
  'work_hash',
]);

const statusType = idl.types.find((type) => type.name === 'EscrowStatus');
if (!statusType) fail('missing EscrowStatus type');
assertList('EscrowStatus variants', listNames(statusType.type.variants), expectedStatusVariants);

for (const forbidden of ['ROADMAP.md', 'solana program deploy', 'anchor deploy', 'npm publish']) {
  if (source.includes(forbidden)) fail(`forbidden source token present: ${forbidden}`);
}

const idlStable = `${JSON.stringify(stable(idl))}\n`;
const sourceTreeMaterial = [
  ['Anchor.toml', anchorToml],
  ['rust-toolchain.toml', rustToolchain],
  ['programs/satp_escrow/Cargo.toml', programCargo],
  ['programs/satp_escrow/src/lib.rs', source],
].map(([path, content]) => `${path}\0${content}`).join('\0');
const idlRaw = readFileSync(idlPath);

console.log(JSON.stringify({
  ok: true,
  idl: relative(root, idlPath),
  idl_sha256: sha256(idlRaw),
  idl_stable_sha256: sha256(idlStable),
  source_tree_sha256: sha256(sourceTreeMaterial),
  program_id: expectedProgramId,
  instructions: expectedInstructions.length,
  events: expectedEvents.length,
  errors: expectedErrors.length,
}, null, 2));

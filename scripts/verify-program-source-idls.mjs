#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

const programs = [
  'identity_registry',
  'attestations',
  'reputation',
  'reviews',
  'validation',
  'satp_escrow',
];

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function listNames(items = []) {
  return [...items.map((item) => item.name)].sort();
}

function assertList(label, actual, expected) {
  const actualText = JSON.stringify([...actual].sort());
  const expectedText = JSON.stringify([...expected].sort());
  if (actualText !== expectedText) {
    fail(`${label} mismatch: expected ${expectedText}, got ${actualText}`);
  }
}

function assertSourceIncludes(source, label, names, matcher) {
  for (const name of names) {
    if (!matcher(name).test(source)) {
      fail(`missing ${label} ${name}`);
    }
  }
}

const summaries = [];

for (const program of programs) {
  const idlPath = resolve(root, `idls/${program}.json`);
  const sourcePath = resolve(root, `programs/${program}/src/lib.rs`);
  const cargoPath = resolve(root, `programs/${program}/Cargo.toml`);
  const idl = JSON.parse(readFileSync(idlPath, 'utf8'));
  const source = readFileSync(sourcePath, 'utf8');
  const cargo = readFileSync(cargoPath, 'utf8');

  const instructionNames = listNames(idl.instructions);
  const accountNames = listNames(idl.accounts);
  const eventNames = listNames(idl.events);
  const errorNames = listNames(idl.errors);

  if (!idl.address) fail(`${program} IDL missing address`);
  if (!source.includes(`declare_id!("${idl.address}")`)) {
    fail(`${program} declare_id does not match IDL address`);
  }
  if (!cargo.includes(`name = "${program}"`)) fail(`${program} Cargo.toml crate name mismatch`);
  if (!cargo.includes('anchor-lang = "0.31.1"')) fail(`${program} anchor-lang lock mismatch`);

  assertSourceIncludes(source, `${program} instruction`, instructionNames, (name) => {
    return new RegExp(`pub fn ${name}\\s*\\(`);
  });
  assertSourceIncludes(source, `${program} account`, accountNames, (name) => {
    return new RegExp(`pub struct ${name}\\s*\\{`);
  });
  assertSourceIncludes(source, `${program} event`, eventNames, (name) => {
    return new RegExp(`pub struct ${name}\\s*\\{`);
  });
  assertSourceIncludes(source, `${program} error`, errorNames, (name) => {
    return new RegExp(`\\b${name}\\s*,`);
  });

  if (program !== 'satp_escrow') {
    const extraForbidden = [
      'solana program deploy',
      'anchor deploy',
      'seed phrase',
      'HQ_AGENT_TOKEN',
      'GITHUB_TOKEN',
      'PRIVATE_KEY',
    ];
    for (const forbidden of extraForbidden) {
      if (source.includes(forbidden)) fail(`${program} forbidden token present: ${forbidden}`);
    }
  }

  summaries.push({
    program,
    idl: relative(root, idlPath),
    source: relative(root, sourcePath),
    address: idl.address,
    idl_sha256: sha256(readFileSync(idlPath)),
    source_sha256: sha256(source),
    instructions: instructionNames.length,
    accounts: accountNames.length,
    events: eventNames.length,
    errors: errorNames.length,
  });
}

assertList('program set', summaries.map((summary) => summary.program), programs);

console.log(JSON.stringify({
  ok: true,
  programs: summaries,
}, null, 2));

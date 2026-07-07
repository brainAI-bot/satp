#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = resolve(root, 'idls/v3');
const sourceRef = 'brainAI-bot/clawd-brainchain/satp-v3@94a1d309dcc692228c357f6e28ab679196235ad2';
const generationCommand = 'node scripts/generate-v3-idls.mjs';
const checkOnly = process.argv.includes('--check');

const programs = [
  'identity_v3',
  'reviews_v3',
  'attestations_v3',
  'reputation_v3',
  'validation_v3',
  'escrow_v3',
];

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

function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function extractIdl(output, program) {
  const marker = /--- IDL begin program ---\s*([\s\S]*?)\s*--- IDL end program ---/m;
  const match = output.match(marker);
  if (!match) {
    throw new Error(`${program}: generated IDL markers not found in cargo test output`);
  }
  return JSON.parse(match[1]);
}

function generate(program) {
  const output = execFileSync('cargo', [
    '+1.89.0',
    'test',
    '-p',
    program,
    '--features',
    'idl-build',
    '__anchor_private_print_idl',
    '--',
    '--show-output',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CARGO_TERM_COLOR: 'never' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const idl = extractIdl(output, program);
  if (idl.metadata?.name !== program) {
    throw new Error(`${program}: metadata.name mismatch: ${idl.metadata?.name}`);
  }
  return idl;
}

if (!checkOnly) mkdirSync(outDir, { recursive: true });

const generated = [];
for (const program of programs) {
  const idl = generate(program);
  const body = pretty(idl);
  const outPath = join(outDir, `${program}.json`);
  if (checkOnly) {
    if (!existsSync(outPath)) {
      throw new Error(`missing generated IDL ${relative(root, outPath)}`);
    }
    const committed = readFileSync(outPath, 'utf8');
    if (committed !== body) {
      throw new Error(`${relative(root, outPath)} does not match generated source IDL`);
    }
  } else {
    writeFileSync(outPath, body);
  }
  generated.push({
    program,
    idl: relative(root, outPath),
    sha256: sha256(body),
    stable_sha256: sha256(pretty(stable(idl))),
    instructions: idl.instructions?.length ?? 0,
    accounts: idl.accounts?.length ?? 0,
    types: idl.types?.length ?? 0,
    errors: idl.errors?.length ?? 0,
  });
}

const result = {
  ok: true,
  mode: checkOnly ? 'check' : 'write',
  source: sourceRef,
  command: generationCommand,
  programs: generated,
};

console.log(JSON.stringify(result, null, 2));

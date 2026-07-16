#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const programsRoot = resolve(root, 'programs');
const anchorPath = resolve(root, 'Anchor.toml');
const cargoPath = resolve(root, 'Cargo.toml');

const programs = [
  {
    name: 'identity_v3',
    devnet: '7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ',
    mainnet: 'GTppU4E44BqXTQgbqMZ68ozFzhP1TLty3EGnzzjtNZfG',
  },
  {
    name: 'reviews_v3',
    devnet: '3yVFrWCpBnQdWNqmiCG9EpoZq7WYeQ421Gx5sUh41Kwk',
    mainnet: 'r9XX4frcqxxAZ6Au9V5PA3EAxs1zoNckqLLmoSRcNr4',
  },
  {
    name: 'attestations_v3',
    devnet: '55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw',
    mainnet: '6Xd1dAQJPvQRJ4Ntr6LtPTjDjPUZ8nfnmYLZaZ2DtrdD',
  },
  {
    name: 'reputation_v3',
    devnet: 'CtmZ1fHaypt3R6wbeiGawiRnjzRK9T8jsECk9mET9AK9',
    mainnet: '2Lz7KzMvKdrGeAuS8WPHu7jK2yScrnKVgacpYVEuDjkJ',
  },
  {
    name: 'validation_v3',
    devnet: 'DLB76DzAFY8KNuvnP79BZW3cehGreEQTeGDvFCNd2Ekj',
    mainnet: '6rYRiCYidJYV7QvKrzKGgNu4oMh6BAvynked69R7xMbV',
  },
  {
    name: 'escrow_v3',
    devnet: 'B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg',
    mainnet: 'B1Se8SPx7GLUisa4LYeXY1tDZy5TviJrsV2yMLgqUXmg',
  },
];

const forbiddenPathPatterns = [
  /(^|\/)\.env($|[./-])/,
  /(^|\/)memory(\/|$)/,
  /(^|\/)target(\/|$)/,
  /(^|\/)\.program-state(\/|$)/,
  /keypair/i,
  /secret/i,
];
const forbiddenContentPatterns = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key PEM block'],
  [/\b(?:SECRET|TOKEN|PRIVATE_KEY|API_KEY)\s*=\s*['"]?[A-Za-z0-9_./+=-]{16,}/, 'env-style secret assignment'],
  [new RegExp(`\\b(?:${'mne'}${'monic'}|seed\\s+phrase)\\b`, 'i'), 'seed material marker'],
];

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walk(path));
    else if (stat.isFile()) entries.push(path);
  }
  return entries;
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) fail(`${label} missing ${needle}`);
}

const anchorToml = read(anchorPath);
const workspaceCargo = read(cargoPath);
assertIncludes(workspaceCargo, '"programs/*"', 'workspace Cargo.toml');
assertIncludes(anchorToml, 'wallet = "./.anchor/readonly-build-wallet.json"', 'Anchor.toml readonly wallet placeholder');

const checked = [];
const treeMaterial = [];

for (const program of programs) {
  const dir = resolve(programsRoot, program.name);
  const cargo = resolve(dir, 'Cargo.toml');
  const source = resolve(dir, 'src/lib.rs');
  if (!existsSync(dir)) fail(`missing program directory ${relative(root, dir)}`);
  if (!existsSync(cargo)) fail(`missing ${relative(root, cargo)}`);
  if (!existsSync(source)) fail(`missing ${relative(root, source)}`);

  const sourceText = read(source);
  const cargoText = read(cargo);
  assertIncludes(sourceText, `declare_id!("${program.devnet}")`, `${program.name} source declare_id`);
  assertIncludes(sourceText, '#[program]', `${program.name} Anchor program module`);
  assertIncludes(cargoText, 'anchor-lang = "1.0.0"', `${program.name} Cargo.toml`);
  assertIncludes(anchorToml, `${program.name} = "${program.devnet}"`, `${program.name} devnet Anchor.toml entry`);
  assertIncludes(anchorToml, `${program.name} = "${program.mainnet}"`, `${program.name} mainnet Anchor.toml entry`);

  const files = walk(dir);
  for (const file of files) {
    const rel = relative(root, file);
    if (forbiddenPathPatterns.some((pattern) => pattern.test(rel))) {
      fail(`forbidden source path in V3 program tree: ${rel}`);
    }
    const content = read(file);
    for (const [pattern, label] of forbiddenContentPatterns) {
      if (pattern.test(content)) fail(`${label} found in ${rel}`);
    }
    if (file.endsWith('.json')) JSON.parse(content);
    treeMaterial.push(`${rel}\0${content}`);
  }

  checked.push({
    name: program.name,
    path: relative(root, dir),
    devnet_program_id: program.devnet,
    mainnet_registry_id: program.mainnet,
    files: files.map((file) => relative(root, file)),
    source_sha256: sha256(sourceText),
  });
}

console.log(JSON.stringify({
  ok: true,
  source: 'brainAI-bot/clawd-brainchain/satp-v3@94a1d309dcc692228c357f6e28ab679196235ad2',
  programs_checked: checked,
  source_tree_sha256: sha256(treeMaterial.join('\0')),
}, null, 2));

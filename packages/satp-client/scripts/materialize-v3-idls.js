#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const sourceDir = path.join(repoRoot, 'idls', 'v3');
const destinationDir = path.join(packageRoot, 'idls', 'v3');
const expectedIdls = [
  'attestations_v3.json',
  'escrow_v3.json',
  'identity_v3.json',
  'reputation_v3.json',
  'reviews_v3.json',
  'validation_v3.json',
];

fs.rmSync(destinationDir, { recursive: true, force: true });
for (const relativeDir of ['', 'mainnet']) {
  const sourceRoot = path.join(sourceDir, relativeDir);
  const destinationRoot = path.join(destinationDir, relativeDir);
  fs.mkdirSync(destinationRoot, { recursive: true });
  for (const filename of expectedIdls) {
    const source = path.join(sourceRoot, filename);
    if (!fs.statSync(source, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Missing V3 ${relativeDir || 'source'} IDL: ${path.relative(repoRoot, source)}`);
    }
    JSON.parse(fs.readFileSync(source, 'utf8'));
    fs.copyFileSync(source, path.join(destinationRoot, filename));
  }
}

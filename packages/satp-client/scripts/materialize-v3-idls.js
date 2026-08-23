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
fs.mkdirSync(destinationDir, { recursive: true });

for (const filename of expectedIdls) {
  const source = path.join(sourceDir, filename);
  if (!fs.statSync(source, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Missing canonical V3 IDL: ${path.relative(repoRoot, source)}`);
  }
  JSON.parse(fs.readFileSync(source, 'utf8'));
  fs.copyFileSync(source, path.join(destinationDir, filename));
}

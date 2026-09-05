#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const anchorPath = resolve(root, 'Anchor.toml');
const {
  V3_DEVNET_PROGRAM_IDS,
  V3_MAINNET_PROGRAM_IDS,
} = require('../packages/satp-client/src/v3-pda.js');

const programs = [
  ['identity_v3', 'IDENTITY', '7qmfg4CgiXVDZGBeUkSkMsacKjCRty2xEAugPK4nfvZQ'],
  ['reviews_v3', 'REVIEWS', '3yVFrWCpBnQdWNqmiCG9EpoZq7WYeQ421Gx5sUh41Kwk'],
  ['attestations_v3', 'ATTESTATIONS', '55aS2y5Lhe427iW4cgo2nmZPrxwH3F7BWkw6MnoEm4zw'],
  ['reputation_v3', 'REPUTATION', 'CtmZ1fHaypt3R6wbeiGawiRnjzRK9T8jsECk9mET9AK9'],
  ['validation_v3', 'VALIDATION', 'DLB76DzAFY8KNuvnP79BZW3cehGreEQTeGDvFCNd2Ekj'],
  ['escrow_v3', 'ESCROW', 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C'],
];

function fail(message) {
  throw new Error(message);
}

function parseAnchorPrograms(toml) {
  const sections = {};
  let current = null;
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const section = line.match(/^\[programs\.(devnet|localnet|mainnet)\]$/);
    if (section) {
      current = section[1];
      sections[current] = {};
      continue;
    }
    if (!current || !line) continue;
    const entry = line.match(/^([A-Za-z0-9_]+)\s*=\s*"([^"]+)"$/);
    if (entry) sections[current][entry[1]] = entry[2];
  }
  return sections;
}

const anchorPrograms = parseAnchorPrograms(readFileSync(anchorPath, 'utf8'));
const checked = [];

for (const [program, sdkKey, canonicalAddress] of programs) {
  const idlPath = resolve(root, 'idls/v3', `${program}.json`);
  const idl = JSON.parse(readFileSync(idlPath, 'utf8'));
  const deployments = idl.metadata && idl.metadata.deployments;
  if (idl.address !== canonicalAddress) {
    fail(`${relative(root, idlPath)} address ${idl.address || '<empty>'} does not match canonical IDL address ${canonicalAddress}`);
  }
  if (!deployments || typeof deployments !== 'object') {
    fail(`${relative(root, idlPath)} missing metadata.deployments`);
  }
  for (const network of ['devnet', 'localnet', 'mainnet']) {
    const expected = anchorPrograms[network] && anchorPrograms[network][program];
    if (!expected) fail(`Anchor.toml missing [programs.${network}] ${program}`);
    if (deployments[network] !== expected) {
      fail(`${relative(root, idlPath)} metadata.deployments.${network} ${deployments[network] || '<empty>'} does not match Anchor.toml ${expected}`);
    }
  }
  if (V3_DEVNET_PROGRAM_IDS[sdkKey].toBase58() !== deployments.devnet) {
    fail(`SDK devnet ${sdkKey} does not match ${relative(root, idlPath)} metadata.deployments.devnet`);
  }
  if (V3_MAINNET_PROGRAM_IDS[sdkKey].toBase58() !== deployments.mainnet) {
    fail(`SDK mainnet ${sdkKey} does not match ${relative(root, idlPath)} metadata.deployments.mainnet`);
  }
  checked.push({
    program,
    address: idl.address,
    devnet: deployments.devnet,
    mainnet: deployments.mainnet,
  });
}

console.log(JSON.stringify({
  ok: true,
  checked,
}, null, 2));

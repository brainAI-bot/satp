#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

const COPY_SURFACES = [
  'docs/agentfolio-consumption-readiness.md',
  'docs/satp-client-consumer-install.md',
  'examples/agentfolio-consumer-readonly/README.md',
];

const REQUIRED_READBACK = [
  /no mainnet-ready claim/i,
  /escrow references are reference-only metadata/i,
  /not\s+escrow-ready,\s+value-bearing,\s+or\s+live payment paths/i,
  /stable npm remains the default consumer dependency/i,
  /offline\/read-only/i,
  /must not\s+sign,\s+send transactions,\s+call Solana RPC,\s+deploy programs,\s+publish packages/i,
  /must not replace\s+AgentFolio product code,\s+production dependency policy,\s+launch state,\s+or\s+marketplace escrow policy/i,
  /Program Metadata account\s+`4zNAR5DGuWuUnEbwGb7FzEVUUCx2xKca2bmHCeVpjQCJ`/i,
  /not canonical for mainnet escrow consumer construction/i,
  /omits the writable\s+`treasury`\s+account from both\s+`release`\s+and\s+`partial_release`/i,
  /legacy Anchor 0\.31 IDL account\s+`D2TVCWarEDQ3w3YFMpackzymm9MGQKeWd1p1pCeZmBcn`[\s\S]*remains stale at 9\s+instructions/i,
  /Consumer construction must\s+fail closed until the published Program Metadata account schema matches the\s+repository IDL/i,
  /live escrow\s+writes\s+still\s+disabled/i,
];

const BANNED_CLAIMS = [
  /\bSATP\s+is\s+(?:mainnet|production|launch)[-\s]?ready\b/i,
  /\bmainnet[-\s]?ready\s+SATP\b/i,
  /\bescrow[-\s]?ready\s+SATP\b/i,
  /\bSATP\s+escrow\s+is\s+(?:ready|live|active|enabled)\b/i,
  /\bvalue[-\s]?bearing\s+(?:escrow|payments?)\s+(?:is|are)\s+(?:ready|live|active|enabled)\b/i,
  /\breplace\s+AgentFolio(?:'s)?\s+production\s+dependency\b/i,
  /\bpromote\s+@brainai\/satp-client\s+to\s+npm\s+latest\b/i,
  /\bready\s+for\s+public\s+launch\b/i,
  /\blive\s+(?:escrow|payment)\s+(?:is|are)\s+(?:ready|active|enabled)\b/i,
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const readinessCopy = read('docs/agentfolio-consumption-readiness.md');
for (const pattern of REQUIRED_READBACK) {
  assert.match(readinessCopy, pattern, `missing copy-gate readback: ${pattern}`);
}

for (const relativePath of COPY_SURFACES) {
  const text = read(relativePath);
  for (const pattern of BANNED_CLAIMS) {
    assert.doesNotMatch(text, pattern, `${relativePath} contains banned readiness claim: ${pattern}`);
  }
}

console.log('AgentFolio consumer copy guard OK: no mainnet/escrow/package readiness claims');

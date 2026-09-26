import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const USER_FACING_SURFACES = [
  'README.md',
  'packages/satp-client/README.md',
  'package.json',
  'packages/satp-client/package.json',
];

const COUPLING_PATTERNS = [
  /\bused by AgentFolio\b/i,
  /\bAgentFolio reference-consumer\b/i,
];

test('SATP user-facing copy does not position AgentFolio as the protocol endorsement', async () => {
  for (const path of USER_FACING_SURFACES) {
    const content = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    for (const pattern of COUPLING_PATTERNS) {
      assert.doesNotMatch(content, pattern, `${path} contains prohibited coupling copy: ${pattern}`);
    }
  }
});

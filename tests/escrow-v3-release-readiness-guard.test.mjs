import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEscrowV3ReleaseReadinessSurfaces,
  findReleaseReadinessViolations,
  provenanceIsUnresolved,
} from '../scripts/check-escrow-v3-release-readiness.mjs';

const gapManifest = {
  status: 'provenance_gap',
  conclusion: {
    source_equals_deployed_binary_equals_published_idl: false,
  },
};

test('current release and consumer guidance surfaces fail closed', () => {
  const result = assertEscrowV3ReleaseReadinessSurfaces();
  assert.equal(result.manifest.status, 'provenance_gap');
  assert.equal(result.manifest.conclusion.source_equals_deployed_binary_equals_published_idl, false);
  assert.ok(result.surfaceCount > 20);
});

test('treats either the gap status or failed three-way certification as unresolved', () => {
  assert.equal(provenanceIsUnresolved(gapManifest), true);
  assert.equal(provenanceIsUnresolved({
    status: 'verified',
    conclusion: { source_equals_deployed_binary_equals_published_idl: false },
  }), true);
});

for (const [name, claim, expectedLabel] of [
  [
    'direct release-ready claim',
    '# Readiness\n\nEscrow V3 is release-ready.',
    'release/mainnet/production-ready escrow claim',
  ],
  [
    'prefixed mainnet-ready label',
    '# Consumer guide\n\nUse the mainnet-ready escrow_v3 program.',
    'release/mainnet/production-ready escrow label',
  ],
  [
    'false provenance resolution',
    '# Release packet\n\nEscrow V3 provenance has been verified.',
    'resolved escrow provenance claim',
  ],
  [
    'false source equality',
    '# Escrow V3\n\nThe tracked source matches the deployed bytes and published IDL.',
    'source/deployed equality claim',
  ],
  [
    'release-ready document status',
    '# Escrow V3\n\nStatus: production-ready',
    'release-ready document status while escrow_v3 provenance is unresolved',
  ],
]) {
  test(`rejects ${name} while provenance remains unresolved`, () => {
    const violations = findReleaseReadinessViolations('docs/example.md', claim, gapManifest);
    assert.ok(violations.some((violation) => violation.label === expectedLabel));
  });
}

test('allows explicit fail-closed guidance', () => {
  const text = [
    '# Escrow V3 release boundary',
    '',
    'Status: provenance_gap.',
    'Escrow V3 is not release-ready or mainnet-ready.',
    'Tracked source does not match the deployed bytes and published IDL.',
  ].join('\n');
  assert.deepEqual(findReleaseReadinessViolations('docs/boundary.md', text, gapManifest), []);
});

test('a valid disclaimer cannot hide a later false readiness claim', () => {
  const text = [
    '# Escrow V3 release boundary',
    '',
    'Escrow V3 is not release-ready while provenance is unresolved.',
    '',
    'Escrow V3 is release-ready.',
  ].join('\n');
  const violations = findReleaseReadinessViolations('docs/contradiction.md', text, gapManifest);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 5);
});

test('an unresolved label cannot excuse a contradictory provenance claim', () => {
  const text = 'Escrow V3 provenance is unresolved, but escrow_v3 provenance is verified.';
  const violations = findReleaseReadinessViolations('docs/contradiction.md', text, gapManifest);
  assert.ok(violations.some((violation) => violation.label === 'resolved escrow provenance claim'));
});

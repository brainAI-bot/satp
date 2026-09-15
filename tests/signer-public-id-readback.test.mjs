import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Keypair } from '@solana/web3.js';
import { readSignerPublicIdBinding } from '../scripts/read-satp-signer-public-id.mjs';

const script = fileURLToPath(new URL('../scripts/read-satp-signer-public-id.mjs', import.meta.url));
const alternatePublicId = Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 33))
  .publicKey
  .toBase58();

function withSyntheticKeypair(run) {
  const directory = mkdtempSync(join(tmpdir(), 'satp-signer-public-id-'));
  const path = join(directory, 'credential-layout-must-not-appear.json');
  const keypair = Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
  const bytes = [...keypair.secretKey];
  writeFileSync(path, JSON.stringify(bytes), { mode: 0o600 });

  try {
    return run({ path, bytes, publicIdentifier: keypair.publicKey.toBase58() });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('helper returns only the public identifier, source class, and match verdict', () => {
  withSyntheticKeypair(({ path, publicIdentifier }) => {
    assert.deepEqual(
      readSignerPublicIdBinding({
        sourceClass: 'synthetic_fixture',
        expectedPublicId: publicIdentifier,
        keypairPath: path,
      }),
      {
        publicIdentifier,
        sourceClass: 'synthetic_fixture',
        verdict: 'match',
      },
    );
  });
});

test('CLI reports mismatch without emitting path, key bytes, or unrelated environment values', () => {
  withSyntheticKeypair(({ path, bytes, publicIdentifier }) => {
    const forbiddenEnvironmentValue = 'FORBIDDEN_ENV_VALUE_926b9931';
    const output = execFileSync(process.execPath, [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SATP_SIGNER_SOURCE_CLASS: 'synthetic_fixture',
        SATP_SIGNER_KEYPAIR_PATH: path,
        SATP_EXPECTED_AUTHORITY: alternatePublicId,
        SATP_FORBIDDEN_SENTINEL: forbiddenEnvironmentValue,
      },
    });
    const result = JSON.parse(output);

    assert.deepEqual(Object.keys(result).sort(), ['publicIdentifier', 'sourceClass', 'verdict']);
    assert.deepEqual(result, {
      publicIdentifier,
      sourceClass: 'synthetic_fixture',
      verdict: 'mismatch',
    });

    const forbidden = [
      path,
      JSON.stringify(bytes),
      forbiddenEnvironmentValue,
      'SATP_SIGNER_KEYPAIR_PATH',
      'SATP_FORBIDDEN_SENTINEL',
    ];
    for (const value of forbidden) assert.equal(output.includes(value), false);
  });
});

test('invalid configured input fails silently instead of leaking its path or parser details', () => {
  const sensitivePath = '/production/layout/must-never-appear/keypair.json';
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SATP_SIGNER_SOURCE_CLASS: 'protected_configured_keypair',
      SATP_SIGNER_KEYPAIR_PATH: sensitivePath,
      SATP_EXPECTED_AUTHORITY: alternatePublicId,
      SATP_FORBIDDEN_SENTINEL: 'FORBIDDEN_ERROR_VALUE_926b9931',
    },
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('already-public source does not require or access a keypair path', () => {
  assert.deepEqual(
    readSignerPublicIdBinding({
      sourceClass: 'already_public_identifier',
      expectedPublicId: alternatePublicId,
      configuredPublicId: alternatePublicId,
      keypairPath: '/ignored/credential/path.json',
    }),
    {
      publicIdentifier: alternatePublicId,
      sourceClass: 'already_public_identifier',
      verdict: 'match',
    },
  );
});

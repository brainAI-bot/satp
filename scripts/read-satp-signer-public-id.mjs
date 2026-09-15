#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Keypair, PublicKey } from '@solana/web3.js';

const SOURCE_CLASSES = new Set([
  'already_public_identifier',
  'protected_configured_keypair',
  'synthetic_fixture',
]);

function isPublicIdentifier(value) {
  if (typeof value !== 'string') return false;
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

function readSyntheticOrConfiguredPublicId(keypairPath) {
  if (typeof keypairPath !== 'string' || keypairPath.length === 0) throw new Error();

  let bytes;
  try {
    bytes = JSON.parse(readFileSync(keypairPath, 'utf8'));
  } catch {
    throw new Error();
  }

  if (
    !Array.isArray(bytes)
    || bytes.length !== 64
    || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
  ) {
    throw new Error();
  }

  try {
    return Keypair.fromSecretKey(Uint8Array.from(bytes)).publicKey.toBase58();
  } catch {
    throw new Error();
  }
}

export function readSignerPublicIdBinding({
  sourceClass,
  expectedPublicId,
  configuredPublicId,
  keypairPath,
}) {
  if (!SOURCE_CLASSES.has(sourceClass) || !isPublicIdentifier(expectedPublicId)) throw new Error();

  const publicIdentifier = sourceClass === 'already_public_identifier'
    ? configuredPublicId
    : readSyntheticOrConfiguredPublicId(keypairPath);

  if (!isPublicIdentifier(publicIdentifier)) throw new Error();

  return {
    publicIdentifier,
    sourceClass,
    verdict: publicIdentifier === expectedPublicId ? 'match' : 'mismatch',
  };
}

function readEnvironment() {
  return {
    sourceClass: process.env.SATP_SIGNER_SOURCE_CLASS,
    expectedPublicId: process.env.SATP_EXPECTED_AUTHORITY,
    configuredPublicId: process.env.SATP_SIGNER_PUBLIC_ID,
    keypairPath: process.env.SATP_SIGNER_KEYPAIR_PATH,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(readSignerPublicIdBinding(readEnvironment())));
  } catch {
    // Fail closed without serializing paths, key bytes, environment values, or
    // parser/runtime errors. Callers use the exit status as the failure signal.
    process.exitCode = 1;
  }
}

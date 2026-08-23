#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function fail(message) {
  throw new Error(`Anchor IDL authority readback: ${message}`);
}

export function encodeBase58(bytes) {
  const value = Buffer.from(bytes);
  let number = value.length === 0 ? 0n : BigInt(`0x${value.toString('hex') || '0'}`);
  let encoded = '';

  while (number > 0n) {
    encoded = BASE58_ALPHABET[Number(number % 58n)] + encoded;
    number /= 58n;
  }

  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === 0) leadingZeroes += 1;
  return '1'.repeat(leadingZeroes) + encoded;
}

export function readAnchorIdlAuthority(rpcResponse) {
  const encoded = rpcResponse?.result?.value?.data?.[0];
  if (typeof encoded !== 'string') fail('RPC response is missing base64 account data');

  const account = Buffer.from(encoded, 'base64');
  if (account.length < 44) fail(`IDL account is ${account.length} bytes; expected at least 44`);

  // Legacy Anchor IDL accounts use: discriminator[8], authority[32], data_len[4].
  return encodeBase58(account.subarray(8, 40));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [, , rpcResponsePath, expectedAuthority] = process.argv;
    if (!rpcResponsePath || !expectedAuthority) {
      fail('usage: read-anchor-idl-authority.mjs RPC_RESPONSE_JSON EXPECTED_AUTHORITY');
    }

    const response = JSON.parse(readFileSync(rpcResponsePath, 'utf8'));
    const authority = readAnchorIdlAuthority(response);
    if (authority !== expectedAuthority) {
      fail(`authority ${authority} does not equal expected ${expectedAuthority}`);
    }
    console.log(authority);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

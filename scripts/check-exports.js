#!/usr/bin/env node
'use strict';

/**
 * Offline package-boundary smoke check.
 * Verifies the Git-installable root entrypoint exposes the SATP client surface
 * expected by AgentFolio and external consumers. This script does not read keys,
 * call Solana RPC, publish packages, or deploy anything.
 */
const satp = require('..');
const { Connection, clusterApiUrl } = require('@solana/web3.js');

const requiredExports = [
  'SATPSDK',
  'SATPV3SDK',
  'createSATPClient',
  'getV3ProgramIds',
  'hashAgentId',
  'getGenesisPDA',
  'prepareIdentityAttestationRequest',
  'buildSatpTrustPacket',
  'validateSatpTrustPacket',
  'buildWalletControlChallenge',
  'canonicalWalletControlChallenge',
  'hashWalletControlChallenge',
  'deriveWalletControlChallengePdas',
  'verifyWalletControlChallengeSignature',
  'X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION',
  'parseX402DiscoveryMetadata',
  'buildX402EvidenceLookup',
  'buildRuntimePolicyActionDescriptorFromX402',
];

const missing = requiredExports.filter((key) => !(key in satp));
if (missing.length) {
  throw new Error(`Missing SATP public exports: ${missing.join(', ')}`);
}

const sdk = satp.createSATPClient({ network: 'devnet' });
if (!sdk || !sdk.programIds || !sdk.programIds.IDENTITY) {
  throw new Error('createSATPClient({ network: devnet }) did not expose program IDs');
}

const request = satp.prepareIdentityAttestationRequest({
  subjectWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',
  claimType: 'github_verified',
  metadataHash: '4d9678a7869c25f26a2e38e43f70fc7d0c4142d20b1743a43e50cd8fd012f3d7',
});
if (request.signingRequired !== false || request.instructions.length !== 0 || request.transaction !== null) {
  throw new Error('prepareIdentityAttestationRequest did not return unsigned offline metadata');
}

const packet = satp.buildSatpTrustPacket({
  subjectWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',
  claimType: 'github_verified',
  metadataHash: '4d9678a7869c25f26a2e38e43f70fc7d0c4142d20b1743a43e50cd8fd012f3d7',
});
if (!satp.validateSatpTrustPacket(packet).ok || packet.flags.signingRequired !== false || packet.transaction !== null) {
  throw new Error('buildSatpTrustPacket did not return validated read-only metadata');
}

const walletControlChallenge = require('@brainai/satp-client/wallet-control-challenge');
const x402Discovery = require('@brainai/satp-client/x402-discovery');
for (const key of [
  'buildWalletControlChallenge',
  'canonicalWalletControlChallenge',
  'hashWalletControlChallenge',
  'deriveWalletControlChallengePdas',
  'verifyWalletControlChallengeSignature',
]) {
  if (typeof satp[key] !== 'function') {
    throw new Error(`SATP root export ${key} is not a function`);
  }
  if (typeof walletControlChallenge[key] !== 'function') {
    throw new Error(`SATP wallet-control subpath export ${key} is not a function`);
  }
}

for (const key of [
  'parseX402DiscoveryMetadata',
  'buildX402EvidenceLookup',
  'buildRuntimePolicyActionDescriptorFromX402',
]) {
  if (typeof satp[key] !== 'function') {
    throw new Error(`SATP root export ${key} is not a function`);
  }
  if (typeof x402Discovery[key] !== 'function') {
    throw new Error(`SATP x402-discovery subpath export ${key} is not a function`);
  }
}

async function assertExecutableMainnetPrograms() {
  const ids = satp.getV3ProgramIds('mainnet');
  const entries = Object.entries(ids);
  const connection = new Connection(
    process.env.SATP_MAINNET_RPC_URL || clusterApiUrl('mainnet-beta'),
    'confirmed'
  );
  const accounts = await connection.getMultipleAccountsInfo(entries.map(([, id]) => id));
  const invalid = entries
    .filter(([, id], index) => !accounts[index] || accounts[index].executable !== true)
    .map(([name, id]) => `${name}:${id.toBase58()}`);
  if (invalid.length) {
    throw new Error(`SATP V3 mainnet program IDs are not executable: ${invalid.join(', ')}`);
  }
  return entries.map(([name, id]) => `${name}:${id.toBase58()}`);
}

assertExecutableMainnetPrograms()
  .then((verified) => {
    console.log(`SATP export surface OK: ${requiredExports.join(', ')}`);
    console.log(`SATP V3 mainnet executable programs OK: ${verified.join(', ')}`);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });

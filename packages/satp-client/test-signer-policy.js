#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  SATP_SIGNER_ROLES,
  OPERATIONAL_SIGNER_ALLOWED_ACTIONS,
  OWNER_UPGRADE_AUTHORITY_BLOCKED_ACTIONS,
  buildSignerSeparationConfig,
  validateSignerSeparationConfig,
} = require('./src');

const OPERATIONAL_PUBLIC_KEY = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG';
const OWNER_PUBLIC_KEY = 'EJtQh4Gyg88zXvSmFpxYkkeZsPwTsjfm4LvjmPQX1FD3';

const config = buildSignerSeparationConfig({
  network: 'devnet',
  operationalSignerPublicKey: OPERATIONAL_PUBLIC_KEY,
  ownerUpgradeAuthorityPublicKey: OWNER_PUBLIC_KEY,
  operationalAllowedActions: ['read_only_rpc', 'devnet_fee_payment', 'read_only_rpc'],
});

assert.equal(config.schemaVersion, 'satp.signerSeparation.v1');
assert.equal(config.operationalSigner.role, SATP_SIGNER_ROLES.OPERATIONAL_SIGNER);
assert.equal(config.operationalSigner.publicKey, OPERATIONAL_PUBLIC_KEY);
assert.deepEqual(config.operationalSigner.allowedActions, ['devnet_fee_payment', 'read_only_rpc']);
assert.equal(config.ownerUpgradeAuthority.role, SATP_SIGNER_ROLES.OWNER_UPGRADE_AUTHORITY);
assert.equal(config.ownerUpgradeAuthority.publicKey, OWNER_PUBLIC_KEY);
assert.equal(config.ownerUpgradeAuthority.operationalSignerMayUse, false);
assert.equal(config.flags.publicKeysOnly, true);
assert.equal(config.flags.readsKeypairs, false);
assert.equal(config.flags.generatesKeypairs, false);
assert.equal(config.flags.transfersAuthority, false);
assert.equal(config.flags.deploysPrograms, false);
assert.equal(config.flags.publishesPackages, false);
assert.equal(config.flags.writesSolanaState, false);
assert(OPERATIONAL_SIGNER_ALLOWED_ACTIONS.includes('offline_transaction_preparation'));
assert(OWNER_UPGRADE_AUTHORITY_BLOCKED_ACTIONS.includes('program_upgrade'));

assert.equal(validateSignerSeparationConfig(config).ok, true);

assert.throws(
  () => buildSignerSeparationConfig({
    operationalSignerPublicKey: OPERATIONAL_PUBLIC_KEY,
    ownerUpgradeAuthorityPublicKey: OPERATIONAL_PUBLIC_KEY,
  }),
  /distinct from Owner upgrade authority/,
);

assert.throws(
  () => buildSignerSeparationConfig({
    operationalSignerPublicKey: OPERATIONAL_PUBLIC_KEY,
    ownerUpgradeAuthorityPublicKey: OWNER_PUBLIC_KEY,
    operationalAllowedActions: ['program_upgrade'],
  }),
  /not low-privilege/,
);

assert.throws(
  () => buildSignerSeparationConfig({
    operationalSignerPublicKey: OPERATIONAL_PUBLIC_KEY,
    ownerUpgradeAuthorityPublicKey: OWNER_PUBLIC_KEY,
    keypairPath: '<redacted>',
  }),
  /must not be present/,
);

const invalid = validateSignerSeparationConfig({
  ...config,
  ownerUpgradeAuthority: {
    ...config.ownerUpgradeAuthority,
    operationalSignerMayUse: true,
  },
});
assert.equal(invalid.ok, false);
assert(invalid.errors.includes('ownerUpgradeAuthority.operationalSignerMayUse must be false'));

const authorityFlagConfig = validateSignerSeparationConfig({
  ...config,
  flags: {
    ...config.flags,
    transfersAuthority: true,
    deploysPrograms: true,
    writesSolanaState: true,
  },
});
assert.equal(authorityFlagConfig.ok, false);
assert(authorityFlagConfig.errors.includes('flags.transfersAuthority must be false'));
assert(authorityFlagConfig.errors.includes('flags.deploysPrograms must be false'));
assert(authorityFlagConfig.errors.includes('flags.writesSolanaState must be false'));

const secretBearingConfig = validateSignerSeparationConfig({
  ...config,
  operationalSigner: {
    ...config.operationalSigner,
    secretKey: '<redacted>',
  },
});
assert.equal(secretBearingConfig.ok, false);
assert.match(secretBearingConfig.errors[0], /must not be present/);

console.log('signer policy separation OK');

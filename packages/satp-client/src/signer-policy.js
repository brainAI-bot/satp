'use strict';

const { PublicKey } = require('@solana/web3.js');

const SATP_SIGNER_ROLES = Object.freeze({
  OPERATIONAL_SIGNER: 'operational_signer',
  OWNER_UPGRADE_AUTHORITY: 'owner_upgrade_authority',
});

const OPERATIONAL_SIGNER_ALLOWED_ACTIONS = Object.freeze([
  'devnet_fee_payment',
  'devnet_transaction_submission',
  'offline_transaction_preparation',
  'read_only_rpc',
]);

const OWNER_UPGRADE_AUTHORITY_BLOCKED_ACTIONS = Object.freeze([
  'program_upgrade',
  'authority_transfer',
  'key_generation',
  'key_rotation',
  'mainnet_deploy',
  'devnet_deploy',
  'npm_publish',
  'funds_custody',
  'funds_transfer',
]);

const OPERATIONAL_SIGNER_AUTHORITY_BOUNDARY =
  'no_upgrade_authority_no_key_management_no_funds_custody';

const OWNER_UPGRADE_AUTHORITY_CUSTODY = 'owner_held';

const SECRET_FIELD_NAMES = Object.freeze([
  'keypair',
  'keypairPath',
  'secretKey',
  'privateKey',
  'seedPhrase',
  'mnemonic',
  'rawEnv',
]);

function normalizePublicKey(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${fieldName} is required`);
  }
  return new PublicKey(value).toBase58();
}

function assertNoSecretFields(input, path = 'config') {
  if (!input || typeof input !== 'object') return;

  for (const [key, value] of Object.entries(input)) {
    const childPath = `${path}.${key}`;
    if (SECRET_FIELD_NAMES.includes(key)) {
      throw new Error(`${childPath} must not be present in SATP signer policy config`);
    }
    if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof PublicKey)) {
      assertNoSecretFields(value, childPath);
    }
  }
}

function normalizeOperationalActions(actions) {
  const requested = actions === undefined ? OPERATIONAL_SIGNER_ALLOWED_ACTIONS : actions;
  if (!Array.isArray(requested)) {
    throw new Error('operational signer actions must be an array');
  }

  const seen = new Set();
  for (const action of requested) {
    if (typeof action !== 'string' || action.length === 0) {
      throw new Error('operational signer actions must be non-empty strings');
    }
    if (!OPERATIONAL_SIGNER_ALLOWED_ACTIONS.includes(action)) {
      throw new Error(`operational signer action is not low-privilege: ${action}`);
    }
    if (OWNER_UPGRADE_AUTHORITY_BLOCKED_ACTIONS.includes(action)) {
      throw new Error(`operational signer action is owner-gated: ${action}`);
    }
    seen.add(action);
  }

  return Array.from(seen).sort();
}

function arraysMatchExactly(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }

  const sortedActual = actual.slice().sort();
  const sortedExpected = expected.slice().sort();
  return sortedExpected.every((action, index) => sortedActual[index] === action);
}

function buildSignerSeparationConfig(opts = {}) {
  assertNoSecretFields(opts);

  const network = opts.network || 'devnet';
  if (network !== 'devnet' && network !== 'mainnet') {
    throw new Error('Invalid network: expected devnet or mainnet');
  }

  const operationalSigner = normalizePublicKey(
    opts.operationalSignerPublicKey,
    'operationalSignerPublicKey',
  );
  const ownerUpgradeAuthority = normalizePublicKey(
    opts.ownerUpgradeAuthorityPublicKey,
    'ownerUpgradeAuthorityPublicKey',
  );

  if (operationalSigner === ownerUpgradeAuthority) {
    throw new Error('operational signer must be distinct from Owner upgrade authority');
  }

  return {
    schemaVersion: 'satp.signerSeparation.v1',
    network,
    operationalSigner: {
      role: SATP_SIGNER_ROLES.OPERATIONAL_SIGNER,
      publicKey: operationalSigner,
      allowedActions: normalizeOperationalActions(opts.operationalAllowedActions),
      blockedActions: OWNER_UPGRADE_AUTHORITY_BLOCKED_ACTIONS.slice().sort(),
      authorityBoundary: OPERATIONAL_SIGNER_AUTHORITY_BOUNDARY,
    },
    ownerUpgradeAuthority: {
      role: SATP_SIGNER_ROLES.OWNER_UPGRADE_AUTHORITY,
      publicKey: ownerUpgradeAuthority,
      custody: OWNER_UPGRADE_AUTHORITY_CUSTODY,
      operationalSignerMayUse: false,
    },
    flags: {
      publicKeysOnly: true,
      readsKeypairs: false,
      generatesKeypairs: false,
      transfersAuthority: false,
      deploysPrograms: false,
      publishesPackages: false,
      writesSolanaState: false,
    },
  };
}

function validateSignerSeparationConfig(config) {
  try {
    assertNoSecretFields(config);
    const normalized = buildSignerSeparationConfig({
      network: config && config.network,
      operationalSignerPublicKey: config && config.operationalSigner && config.operationalSigner.publicKey,
      ownerUpgradeAuthorityPublicKey: config && config.ownerUpgradeAuthority && config.ownerUpgradeAuthority.publicKey,
      operationalAllowedActions: config && config.operationalSigner && config.operationalSigner.allowedActions,
    });

    const errors = [];
    if (!config || config.schemaVersion !== 'satp.signerSeparation.v1') {
      errors.push('schemaVersion must be satp.signerSeparation.v1');
    }
    if (!config || !config.flags || config.flags.publicKeysOnly !== true) {
      errors.push('flags.publicKeysOnly must be true');
    }
    if (!config || !config.operationalSigner || config.operationalSigner.role !== SATP_SIGNER_ROLES.OPERATIONAL_SIGNER) {
      errors.push('operationalSigner.role must be operational_signer');
    }
    if (!config || !config.ownerUpgradeAuthority || config.ownerUpgradeAuthority.role !== SATP_SIGNER_ROLES.OWNER_UPGRADE_AUTHORITY) {
      errors.push('ownerUpgradeAuthority.role must be owner_upgrade_authority');
    }
    if (!config || !config.operationalSigner || config.operationalSigner.authorityBoundary !== OPERATIONAL_SIGNER_AUTHORITY_BOUNDARY) {
      errors.push(`operationalSigner.authorityBoundary must be ${OPERATIONAL_SIGNER_AUTHORITY_BOUNDARY}`);
    }
    if (!config || !config.ownerUpgradeAuthority || config.ownerUpgradeAuthority.custody !== OWNER_UPGRADE_AUTHORITY_CUSTODY) {
      errors.push(`ownerUpgradeAuthority.custody must be ${OWNER_UPGRADE_AUTHORITY_CUSTODY}`);
    }
    if (
      !config
      || !config.operationalSigner
      || !arraysMatchExactly(config.operationalSigner.blockedActions, OWNER_UPGRADE_AUTHORITY_BLOCKED_ACTIONS)
    ) {
      errors.push('operationalSigner.blockedActions must list all owner-gated actions');
    }
    if (config && config.ownerUpgradeAuthority && config.ownerUpgradeAuthority.operationalSignerMayUse !== false) {
      errors.push('ownerUpgradeAuthority.operationalSignerMayUse must be false');
    }
    for (const flagName of [
      'readsKeypairs',
      'generatesKeypairs',
      'transfersAuthority',
      'deploysPrograms',
      'publishesPackages',
      'writesSolanaState',
    ]) {
      if (!config || !config.flags || config.flags[flagName] !== false) {
        errors.push(`flags.${flagName} must be false`);
      }
    }
    return { ok: errors.length === 0, errors, normalized };
  } catch (e) {
    return { ok: false, errors: [e.message], normalized: null };
  }
}

module.exports = {
  SATP_SIGNER_ROLES,
  OPERATIONAL_SIGNER_ALLOWED_ACTIONS,
  OWNER_UPGRADE_AUTHORITY_BLOCKED_ACTIONS,
  buildSignerSeparationConfig,
  validateSignerSeparationConfig,
};

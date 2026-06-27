'use strict';

const client = require('@brainai/satp-client');
const core = require('@brainai/satp-core');
const solana = require('@brainai/satp-solana');

module.exports = {
  ...client,
  core,
  solana,
};

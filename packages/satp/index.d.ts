import client = require('@brainai/satp-client');
import core = require('@brainai/satp-core');
import solana = require('@brainai/satp-solana');

declare const satp: typeof client & {
  core: typeof core;
  solana: typeof solana;
};

export = satp;

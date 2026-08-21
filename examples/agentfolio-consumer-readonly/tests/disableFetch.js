'use strict';

Object.defineProperty(globalThis, 'fetch', {
  configurable: false,
  value() {
    throw new Error('read-only consumer example attempted a network fetch');
  },
});

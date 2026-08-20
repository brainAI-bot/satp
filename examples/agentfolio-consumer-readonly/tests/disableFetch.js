'use strict';

Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value() {
    throw new Error('read-only consumer example attempted a network fetch');
  },
});

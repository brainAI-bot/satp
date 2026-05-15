'use strict';

function createMockX402Gate({ expectedHeader = 'satp-fixture-pass' } = {}) {
  return {
    async verify({ headers = {}, toolName = 'satp.unknown' } = {}) {
      const presented = headers['x-402-fixture'] || headers['X-402-Fixture'];
      const allowed = presented === expectedHeader;
      return {
        allowed,
        toolName,
        mode: 'mock-verifier',
        livePayment: false,
        reason: allowed ? 'fixture header accepted' : 'missing or invalid fixture header',
      };
    },
  };
}

module.exports = { createMockX402Gate };

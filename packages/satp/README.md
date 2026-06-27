# @brainai/satp

Umbrella package entrypoint for the stable SATP public API.

This package remains private during SATP-EXTRACT-001. It is importable inside
the workspace and in PR review tests, but npm publishing and install-ready
consumer docs are explicitly out of scope.

```js
const satp = require('@brainai/satp');

const packet = satp.buildSatpTrustPacket({
  subjectWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG',
  claimType: 'github_verified',
  metadataHash: '4d9678a7869c25f26a2e38e43f70fc7d0c4142d20b1743a43e50cd8fd012f3d7',
});
```

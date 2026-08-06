# SATP x402 Reputation Evidence Lookup API

Issue #14 Track C defines this as a PR-scoped specification and offline
prototype for third-party consumers. It does not launch a paid endpoint, set
production pricing, select treasury addresses, approve x402 spend, publish npm
packages, deploy Solana programs, write devnet/mainnet state, or authorize
agent actions.

## Endpoint

`GET /v1/satp/evidence/reputation`

The endpoint returns SATP-backed reputation and supporting evidence for a single
agent or wallet. It is a read-only lookup surface that a host runtime can call
before deciding whether to show trust data, ask for operator approval, or deny a
protected action.

### Query Parameters

| Name | Required | Description |
| --- | --- | --- |
| `agentId` | Conditional | SATP agent identifier to resolve. Required when `wallet` is omitted. |
| `wallet` | Conditional | Subject Solana wallet. Required when `agentId` is omitted. |
| `network` | No | `devnet` or `mainnet`. Defaults to the provider's documented default. |
| `include` | No | Comma-separated evidence groups. Proposed values: `identity`, `reputation`, `reviews`, `attestations`, `validation`, `policy`. |
| `minEvidenceUpdatedAt` | No | ISO-8601 timestamp. The server can return `412 stale_evidence` if the cached SATP evidence is older than this bound. |
| `trace` | No | `redacted` requests a display-safe proof trace without raw private metadata. |

Exactly one of `agentId` or `wallet` should be the primary lookup key. If both
are supplied, the response must include a binding check showing whether the
wallet is linked to the resolved agent.

### Request Example

```http
GET /v1/satp/evidence/reputation?agentId=brainChain&network=devnet&include=identity,reputation,attestations,policy&trace=redacted HTTP/1.1
Host: satp-provider.example
Accept: application/json
X-PAYMENT: <x402-payment-proof>
```

### Success Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
SATP-Evidence-Schema: satp.x402ReputationEvidenceLookup.v1
```

```json
{
  "schemaVersion": "satp.x402ReputationEvidenceLookup.v1",
  "lookup": {
    "lookupId": "lkp_20260728_brainchain_devnet_01",
    "agentId": "brainChain",
    "wallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBNG",
    "network": "devnet",
    "queriedAt": "2026-07-28T03:18:00Z"
  },
  "identity": {
    "genesisPda": "8Q3sExampleGenesisPda1111111111111111111111",
    "active": true,
    "linkedWalletVerified": true
  },
  "reputation": {
    "score": 88,
    "tier": "trusted",
    "sourceProgram": "reputation_v3",
    "computedAt": "2026-07-28T03:10:00Z"
  },
  "evidence": {
    "attestations": [
      {
        "claimType": "github_verified",
        "issuer": "satp-attestation-authority",
        "status": "valid",
        "attestationPda": "6XdExampleAttestationPda111111111111111111111"
      }
    ],
    "reviews": {
      "count": 12,
      "weightedAverage": 4.8
    },
    "validation": {
      "level": 3,
      "status": "verified"
    }
  },
  "proof": {
    "source": "satp",
    "programSet": "v3",
    "commitment": "confirmed",
    "trace": "redacted",
    "evidenceUpdatedAt": "2026-07-28T03:10:00Z"
  },
  "policyBoundary": {
    "paymentAuthorization": false,
    "actionAuthorization": false,
    "spendAuthorized": false,
    "livePaymentRequiredByClient": false,
    "guardrail": "X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION",
    "message": "x402 payment grants lookup access only and does not authorize SATP agent actions."
  }
}
```

### Error Responses

```json
{
  "schemaVersion": "satp.x402ReputationEvidenceLookup.v1",
  "error": {
    "code": "missing_lookup_key",
    "message": "Provide agentId or wallet."
  },
  "policyBoundary": {
    "paymentAuthorization": false,
    "actionAuthorization": false,
    "guardrail": "X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION"
  }
}
```

```json
{
  "schemaVersion": "satp.x402ReputationEvidenceLookup.v1",
  "error": {
    "code": "stale_evidence",
    "message": "Evidence is older than minEvidenceUpdatedAt.",
    "evidenceUpdatedAt": "2026-07-27T23:10:00Z"
  },
  "policyBoundary": {
    "paymentAuthorization": false,
    "actionAuthorization": false,
    "guardrail": "X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION"
  }
}
```

## x402 Payment Terms

Providers can protect the lookup with x402 while keeping SATP action authority
separate. The proposed discovery resource is:

`GET /.well-known/x402/satp/reputation-evidence`

For the public, no-payment-required payment-info contract that replaces callers
probing `/api/x402/info`, see
[`docs/x402-payment-info-contract.md`](./x402-payment-info-contract.md).

Example discovery metadata:

```json
{
  "schemaVersion": "satp.x402DiscoveryMetadata.v1",
  "protocol": "x402",
  "action": "satp.reputationEvidence.lookup",
  "endpoint": "https://satp-provider.example/v1/satp/evidence/reputation",
  "resource": "satp://evidence/reputation",
  "paymentRequired": true,
  "accepts": [
    {
      "scheme": "exact",
      "network": "<provider-selected-payment-network>",
      "asset": "<provider-selected-asset>",
      "payTo": "<provider-controlled-recipient>",
      "maxAmountRequired": "<provider-disclosed-maximum>",
      "resource": "https://satp-provider.example/v1/satp/evidence/reputation",
      "description": "Read-only SATP reputation evidence lookup",
      "mimeType": "application/json",
      "maxTimeoutSeconds": 60
    }
  ],
  "guardrail": "X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION"
}
```

The SATP repo does not set live payment price, treasury, recipient, asset, or
network values in this spec. A provider that implements the endpoint must
publish its own x402 terms, validate payment proofs on its own infrastructure,
and return `402 Payment Required` when payment is missing or invalid.

Example `402` response:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
X-Accept-Payment: <x402-accepts-envelope>
```

```json
{
  "schemaVersion": "satp.x402ReputationEvidenceLookup.v1",
  "error": {
    "code": "payment_required",
    "message": "Submit an x402 payment proof to access this read-only lookup."
  },
  "payment": {
    "protocol": "x402",
    "accepts": [
      {
        "scheme": "exact",
        "network": "<provider-selected-payment-network>",
        "asset": "<provider-selected-asset>",
        "payTo": "<provider-controlled-recipient>",
        "maxAmountRequired": "<provider-disclosed-maximum>",
        "resource": "https://satp-provider.example/v1/satp/evidence/reputation"
      }
    ]
  },
  "policyBoundary": {
    "paymentAuthorization": false,
    "actionAuthorization": false,
    "spendAuthorized": false,
    "guardrail": "X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION",
    "message": "Payment unlocks this lookup response only."
  }
}
```

## Third-Party SATP Caller Example

Third-party runtimes should treat the endpoint as an evidence source, not as a
decision-maker. The caller can fetch evidence, verify the response shape, and
then pass the result into its own SATP runtime policy.

```js
const {
  buildRuntimePolicyActionDescriptorFromX402Discovery,
} = require('@brainai/satp-client');

async function fetchReputationEvidence({ fetchImpl = fetch, endpoint, agentId, x402PaymentHeader }) {
  const url = new URL(endpoint);
  url.searchParams.set('agentId', agentId);
  url.searchParams.set('include', 'identity,reputation,attestations,policy');

  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'X-PAYMENT': x402PaymentHeader,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error && body.error.code ? body.error.code : 'satp_lookup_failed');
  if (body.policyBoundary.actionAuthorization !== false) {
    throw new Error('x402 lookup response attempted to authorize an action');
  }
  return body;
}

const descriptor = buildRuntimePolicyActionDescriptorFromX402Discovery({
  action: 'satp.reputationEvidence.lookup',
  endpoint: 'https://satp-provider.example/v1/satp/evidence/reputation',
  accepts: [{ scheme: 'exact', resource: 'satp://evidence/reputation' }],
});
```

See the runnable offline example at
`packages/satp-client/examples/x402-reputation-evidence-lookup-client.js`.

## Security Notes

Payment grants lookup access only. It does not authorize agent actions, Solana
transactions, signing, keypair access, escrow movement, writes to SATP programs,
production deploys, npm publishing, or host policy bypass.

Consumers must fail closed when:

- the lookup response changes `paymentAuthorization`, `actionAuthorization`, or
  `spendAuthorized` to `true`;
- the SATP evidence is stale for the consumer's policy;
- the response binds a supplied `wallet` to a different `agentId`;
- x402 discovery metadata points to an unexpected endpoint or resource;
- the provider omits redacted trace/proof fields required by the consumer.

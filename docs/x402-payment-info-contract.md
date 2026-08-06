# SATP Public x402 Payment-Info Contract

Issue #14 Track C defines this as the SATP-side contract for a public
payment-info route that replaces callers probing `/api/x402/info`, which is not
part of the SATP public API and can return `404`. This document is a
specification only. It does not activate a paid endpoint, set production
pricing, choose a payment network, choose an asset, choose a treasury or
recipient address, approve spend, deploy Solana programs, write devnet/mainnet
state, publish npm packages, or authorize agent actions.

## Endpoint

`GET /.well-known/x402/satp/payment-info`

The route is public and read-only. It returns the provider's advertised x402
payment terms for SATP lookup surfaces so third-party callers can decide whether
to attempt a paid lookup. The route itself must not require x402 payment.

Providers that need an application API path may also expose:

`GET /v1/satp/x402/payment-info`

If both paths are available, they must return the same contract fields for the
same resource.

## Query Parameters

| Name | Required | Description |
| --- | --- | --- |
| `resource` | No | SATP resource URI or endpoint to describe. Defaults to `satp://evidence/reputation`. |
| `network` | No | SATP evidence network, such as `devnet` or `mainnet`. This is not necessarily the x402 payment network. |
| `agentId` | No | Optional agent identifier for callers that want resource-specific display text. It must not change action authority. |
| `wallet` | No | Optional subject wallet for callers that want resource-specific display text. It must not change action authority. |
| `format` | No | `json` by default. Other formats are out of scope for this contract. |

The payment-info route must not require a lookup key. `agentId` and `wallet`
can refine display metadata, but the route is not an evidence lookup and must
not return reputation, attestations, reviews, validation status, private
metadata, or a grant token.

## Request Example

```http
GET /.well-known/x402/satp/payment-info?resource=satp%3A%2F%2Fevidence%2Freputation&network=devnet HTTP/1.1
Host: satp-provider.example
Accept: application/json
```

## Success Response

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: public, max-age=300
SATP-Payment-Info-Schema: satp.x402PaymentInfo.v1
```

```json
{
  "schemaVersion": "satp.x402PaymentInfo.v1",
  "protocol": "x402",
  "resource": "satp://evidence/reputation",
  "lookup": {
    "action": "satp.reputationEvidence.lookup",
    "method": "GET",
    "endpoint": "https://satp-provider.example/v1/satp/evidence/reputation",
    "query": {
      "agentId": "optional",
      "wallet": "optional",
      "network": "optional",
      "include": "optional",
      "trace": "optional"
    }
  },
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
  "documentation": {
    "evidenceLookup": "https://github.com/brainAI-bot/satp/blob/main/docs/x402-reputation-evidence-lookup-api.md"
  },
  "limits": {
    "paymentInfoRequiresPayment": false,
    "returnsEvidence": false,
    "returnsPrivateMetadata": false,
    "grantsActionAuthority": false
  },
  "policyBoundary": {
    "paymentAuthorization": false,
    "actionAuthorization": false,
    "spendAuthorized": false,
    "livePaymentRequiredByClient": false,
    "guardrail": "X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION",
    "message": "x402 payment terms describe lookup access only and do not authorize SATP agent actions."
  }
}
```

The SATP repo does not set live `network`, `asset`, `payTo`, or
`maxAmountRequired` values. Implementing providers must publish provider-owned
values and validate payment proofs on provider-owned infrastructure.

## Error Responses

Unknown resources should fail with a normal JSON error and the same policy
boundary. They must not return a payment challenge that implies action
authorization.

```http
HTTP/1.1 404 Not Found
Content-Type: application/json
SATP-Payment-Info-Schema: satp.x402PaymentInfo.v1
```

```json
{
  "schemaVersion": "satp.x402PaymentInfo.v1",
  "error": {
    "code": "unknown_resource",
    "message": "No SATP x402 payment-info contract is published for this resource."
  },
  "policyBoundary": {
    "paymentAuthorization": false,
    "actionAuthorization": false,
    "spendAuthorized": false,
    "guardrail": "X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION",
    "message": "Payment-info discovery never authorizes agent actions."
  }
}
```

Malformed query parameters should fail closed:

```json
{
  "schemaVersion": "satp.x402PaymentInfo.v1",
  "error": {
    "code": "invalid_payment_info_request",
    "message": "The requested resource must be a SATP resource URI or documented lookup endpoint."
  },
  "policyBoundary": {
    "paymentAuthorization": false,
    "actionAuthorization": false,
    "spendAuthorized": false,
    "guardrail": "X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION"
  }
}
```

## Relationship To Paid Lookup

The payment-info route describes how to pay for a lookup. It is not the lookup
itself.

| Route | Public without payment | Returns SATP evidence | May return x402 payment terms |
| --- | --- | --- | --- |
| `GET /.well-known/x402/satp/payment-info` | Yes | No | Yes |
| `GET /v1/satp/evidence/reputation` | Provider-defined; can return `402` | Yes, after provider validation | Yes, on `402` |

The paid lookup response shape is specified in
[`docs/x402-reputation-evidence-lookup-api.md`](./x402-reputation-evidence-lookup-api.md).

## Third-Party SATP Caller Example

Third-party runtimes can read payment-info, display the provider's terms, and
then decide whether a separate operator-approved x402 payment should be
constructed. The payment-info document itself must be treated as metadata, not
as permission to perform an agent action.

```js
async function readSatpPaymentInfo({
  fetchImpl = fetch,
  infoEndpoint = 'https://satp-provider.example/.well-known/x402/satp/payment-info',
  resource = 'satp://evidence/reputation',
  network = 'devnet',
}) {
  const url = new URL(infoEndpoint);
  url.searchParams.set('resource', resource);
  url.searchParams.set('network', network);

  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error && body.error.code ? body.error.code : 'satp_payment_info_failed');
  }
  if (body.schemaVersion !== 'satp.x402PaymentInfo.v1') {
    throw new Error('unsupported SATP x402 payment-info schema');
  }
  if (
    body.policyBoundary.actionAuthorization !== false ||
    body.policyBoundary.spendAuthorized !== false
  ) {
    throw new Error('x402 payment-info attempted to authorize action or spend');
  }
  return body;
}
```

After reading payment-info, a caller that has separate operator approval can
construct an x402 payment proof for the documented lookup endpoint and call
`GET /v1/satp/evidence/reputation` as described in the evidence lookup spec.
SATP callers must still apply their own runtime policy to the evidence result.

## Security Notes

Payment grants lookup or evidence access only. It does not authorize SATP agent
actions, Solana transactions, signing, keypair access, escrow movement, SATP
program writes, production deploys, npm publishing, or host policy bypass.

Consumers must fail closed when:

- the payment-info response changes `paymentAuthorization`,
  `actionAuthorization`, or `spendAuthorized` to `true`;
- the payment-info route returns evidence, private metadata, credentials,
  grant tokens, or executable instructions;
- provider payment terms point to an unexpected lookup endpoint or resource;
- the paid lookup response omits the
  `X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION` guardrail.

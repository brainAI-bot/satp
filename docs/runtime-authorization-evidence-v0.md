# Runtime authorization evidence v0

`satp.runtimeAuthorizationEvidence.v0` is a dependency-free, offline contract for carrying narrowly bound authorization evidence into a host runtime. It does not make network requests, authorize payments, write Solana state, use keypairs, deploy programs, or publish packages.

This profile is intentionally fail closed. The host must configure an explicit set of verifier identifiers and the exact runtime context it expects. A valid evidence object only authorizes the listed scope for its subject, audience, resource, policy, and lifetime; it is not blanket SATP authorization.

## Canonical shape

```json
{
  "schemaVersion": "satp.runtimeAuthorizationEvidence.v0",
  "profile": {
    "id": "satp.runtimeAuthorizationEvidence",
    "version": "0"
  },
  "issuer": "did:web:issuer.example",
  "verifier": "offline-verifier:primary",
  "subject": "satp:agent:brainchain-demo",
  "audience": "runtime:mcp-host",
  "resource": "mcp://tools/reputation.read",
  "evidenceDigest": {
    "algorithm": "sha256",
    "value": "1111111111111111111111111111111111111111111111111111111111111111"
  },
  "observedAt": "2026-08-14T10:00:00.000Z",
  "expiresAt": "2026-08-14T11:00:00.000Z",
  "authorizationScope": ["evidence:read", "reputation:read"],
  "policyDigest": {
    "algorithm": "sha256",
    "value": "2222222222222222222222222222222222222222222222222222222222222222"
  }
}
```

`normalizeRuntimeAuthorizationEvidence(input)` accepts the documented camelCase and snake_case aliases, converts timestamps to ISO 8601, lowercases SHA-256 digests, de-duplicates and sorts scope strings, and rejects missing or malformed trust-critical fields. It never invents profile, principal, digest, binding, scope, or time values.

`verifyRuntimeAuthorizationEvidence(input, options)` normalizes and verifies the object against explicit host expectations:

```js
const {
  verifyRuntimeAuthorizationEvidence,
} = require('@brainai/satp-client/runtime-authorization-evidence');

const result = verifyRuntimeAuthorizationEvidence(input, {
  now: '2026-08-14T10:30:00.000Z',
  expectedIssuer: 'did:web:issuer.example',
  expectedVerifier: 'offline-verifier:primary',
  expectedSubject: 'satp:agent:brainchain-demo',
  expectedAudience: 'runtime:mcp-host',
  expectedResource: 'mcp://tools/reputation.read',
  expectedEvidenceDigest: 'sha256:' + '1'.repeat(64),
  expectedPolicyDigest: 'sha256:' + '2'.repeat(64),
  requiredScopes: ['evidence:read', 'reputation:read'],
  availableVerifiers: new Set(['offline-verifier:primary']),
});

if (!result.ok) throw new Error(result.reasonCode);
```

`availableVerifiers` is mandatory for successful verification. It may be a verifier string, string array, `Set`, or a record whose trusted verifier keys map to `true`. There is no callback or remote discovery path, so verification remains deterministic and offline.

## Fail-closed reason codes

The verifier returns one reason code. Precedence is:

1. `unsupported_profile` — profile id or version is not supported.
2. `invalid_evidence` — required data, digest syntax, issuer, evidence digest, timestamps, or verification options are invalid.
3. `authorization_expired` — `expiresAt` is at or before the evaluation time.
4. `scope_mismatch` — subject, audience, resource, required scope, or policy digest is not bound to the requested runtime context.
5. `verifier_unavailable` — the named verifier is absent from the explicit offline trust set or differs from the expected verifier.

Fixtures live in `tests/conformance/fixtures/runtime-authorization-evidence-v0/`. The implementation is an issue [#14](https://github.com/brainAI-bot/satp/issues/14) runtime-policy follow-on and does not change the existing rule that policy decisions remain local to the host.

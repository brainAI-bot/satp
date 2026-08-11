'use strict';

const DECISIONS = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
  DEGRADE: 'degrade',
  NEEDS_APPROVAL: 'needs_approval',
});

const REASON_CODES = Object.freeze({
  ACTOR_EVIDENCE_ACTION_UNBOUND: 'ACTOR_EVIDENCE_ACTION_UNBOUND',
  ACTOR_EVIDENCE_FRESH: 'ACTOR_EVIDENCE_FRESH',
  ACTOR_EVIDENCE_MISSING: 'ACTOR_EVIDENCE_MISSING',
  ACTOR_EVIDENCE_REVOKED: 'ACTOR_EVIDENCE_REVOKED',
  ACTOR_EVIDENCE_STALE: 'ACTOR_EVIDENCE_STALE',
  ACTOR_EVIDENCE_UNVERIFIED: 'ACTOR_EVIDENCE_UNVERIFIED',
  ACTOR_EVIDENCE_VERIFIED: 'ACTOR_EVIDENCE_VERIFIED',
  ACTOR_ID_MISSING: 'ACTOR_ID_MISSING',
  ACTOR_SUBJECT_MISMATCH: 'ACTOR_SUBJECT_MISMATCH',
  ACTION_PAYMENT_NEEDS_APPROVAL: 'ACTION_PAYMENT_NEEDS_APPROVAL',
  ACTION_PAYMENT_PREAPPROVED: 'ACTION_PAYMENT_PREAPPROVED',
  ACTION_CONTEXT_MISMATCH: 'ACTION_CONTEXT_MISMATCH',
  DELEGATION_CONTEXT_MISSING: 'DELEGATION_CONTEXT_MISSING',
  DELEGATION_DEPTH_EXCEEDED: 'DELEGATION_DEPTH_EXCEEDED',
  EVIDENCE_FRESH: 'EVIDENCE_FRESH',
  EVIDENCE_STALE_OR_MISSING: 'EVIDENCE_STALE_OR_MISSING',
  IDENTITY_INACTIVE: 'IDENTITY_INACTIVE',
  IDENTITY_UNVERIFIED: 'IDENTITY_UNVERIFIED',
  INVALID_ACTION_COST_USD: 'INVALID_ACTION_COST_USD',
  LOCAL_POLICY_ALLOW: 'LOCAL_POLICY_ALLOW',
  MISSING_CAPABILITY: 'MISSING_CAPABILITY',
  PROTECTED_TOOL_REQUIRES_APPROVAL: 'PROTECTED_TOOL_REQUIRES_APPROVAL',
  SUBJECT_ID_MISSING: 'SUBJECT_ID_MISSING',
  TRUST_SCORE_BELOW_DENY_FLOOR: 'TRUST_SCORE_BELOW_DENY_FLOOR',
  TRUST_SCORE_BELOW_MINIMUM: 'TRUST_SCORE_BELOW_MINIMUM',
  TRUST_SCORE_OK: 'TRUST_SCORE_OK',
  X402_LOOKUP_PAYMENT_PREAPPROVED: 'X402_LOOKUP_PAYMENT_PREAPPROVED',
  X402_LOOKUP_REQUIRES_APPROVAL: 'X402_LOOKUP_REQUIRES_APPROVAL',
  X402_LOOKUP_SETTLEMENT_BOUND: 'X402_LOOKUP_SETTLEMENT_BOUND',
  X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION: 'X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION',
  X402_SETTLEMENT_CONTEXT_MISMATCH: 'X402_SETTLEMENT_CONTEXT_MISMATCH',
  X402_SETTLEMENT_IS_NOT_TASK_OUTCOME_PROOF: 'X402_SETTLEMENT_IS_NOT_TASK_OUTCOME_PROOF',
  X402_SETTLEMENT_UNVERIFIED: 'X402_SETTLEMENT_UNVERIFIED',
  X402_SETTLEMENT_VERIFIED: 'X402_SETTLEMENT_VERIFIED',
});

const DEFAULT_POLICY = Object.freeze({
  minimumTrustScore: 70,
  denyTrustScoreBelow: 25,
  maxAutoSpendUsd: 0,
  requireVerifiedIdentity: true,
  staleEvidenceAfterMs: 7 * 24 * 60 * 60 * 1000,
  maxActorEvidenceAgeMs: 15 * 60 * 1000,
  maxDelegationDepth: 1,
  maxSettlementAgeMs: 15 * 60 * 1000,
});

const RUNTIME_POLICY_AUDIT_TRACE_SCHEMA_VERSION = 'satp.runtimePolicyAuditTrace.v1';
const RUNTIME_POLICY_HOST_ACTION_DESCRIPTOR_SCHEMA_VERSION = 'satp.runtimePolicyHostActionDescriptor.v1';
const TRUST_SCORE_GATE_TYPES = new Set(['agentfolio_trust_gate', 'host_trust_gate']);

function createRuntimePolicyAdapter(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('runtime policy adapter config must be an object');
  }

  const adapterPolicy = normalizePolicy(config.policy);
  const defaultActionType = config.defaultActionType || null;
  const nowProvider = config.now;
  const redact = config.redact;

  if (nowProvider !== undefined && typeof nowProvider !== 'function' && !isValidDateInput(nowProvider)) {
    throw new Error('runtime policy adapter now must be a function or valid date input');
  }
  if (redact !== undefined && typeof redact !== 'function') {
    throw new Error('runtime policy adapter redact must be a function');
  }

  function adapterOptions(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error('runtime policy adapter method options must be an object');
    }

    return {
      ...options,
      now: resolveAdapterNow(nowProvider, options.now),
      policy: {
        ...adapterPolicy,
        ...(options.policy || {}),
      },
    };
  }

  return Object.freeze({
    action(input = {}, overrides = {}) {
      const base = applyDefaultActionType(input, defaultActionType);
      return buildRuntimePolicyActionDescriptor(base, overrides);
    },

    evaluate(identityPayload, actionDescriptor, options = {}) {
      return evaluateRuntimePolicy(identityPayload, actionDescriptor, adapterOptions(options));
    },

    auditTrace(identityPayload, actionDescriptor, options = {}) {
      const traceAction = redact ? attachRedactedResourceLabel(actionDescriptor, redact) : actionDescriptor;
      return buildRuntimePolicyAuditTrace(identityPayload, traceAction, adapterOptions(options));
    },

    explain(result) {
      return explainRuntimePolicyResult(result);
    },
  });
}

function evaluateRuntimePolicy(identityPayload, actionDescriptor, options = {}) {
  const policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
  const now = options.now ? new Date(options.now) : new Date();
  const identity = normalizeIdentity(identityPayload);
  const action = normalizeAction(actionDescriptor);
  const reasonCodes = [];
  const checks = {};

  if (identity.explicitActorContext) {
    const actorDecision = evaluateActorEvidence(identity, action, policy, now, reasonCodes, checks);
    if (actorDecision) return actorDecision;
  }

  checks.identityActive = identity.active === true;
  if (!checks.identityActive) {
    reasonCodes.push(REASON_CODES.IDENTITY_INACTIVE);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Identity is not active.');
  }

  checks.identityVerified = !policy.requireVerifiedIdentity || identity.verified === true;
  if (!checks.identityVerified) {
    reasonCodes.push(REASON_CODES.IDENTITY_UNVERIFIED);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Identity is not verified by local policy.');
  }

  checks.hasCapability = !action.requiresCapability || identity.capabilities.includes(action.requiresCapability);
  if (!checks.hasCapability) {
    reasonCodes.push(REASON_CODES.MISSING_CAPABILITY);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Required capability is absent.');
  }

  checks.trustScore = identity.trustScore;
  checks.minimumTrustScore = action.minimumTrustScore ?? policy.minimumTrustScore;
  if (identity.trustScore < policy.denyTrustScoreBelow) {
    reasonCodes.push(REASON_CODES.TRUST_SCORE_BELOW_DENY_FLOOR);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Trust score is below the deny floor.');
  }

  if (identity.trustScore < checks.minimumTrustScore) {
    reasonCodes.push(REASON_CODES.TRUST_SCORE_BELOW_MINIMUM);
    if (action.allowDegraded === true) {
      return decision(DECISIONS.DEGRADE, reasonCodes, checks, 'Trust score permits degraded access only.');
    }
    return decision(DECISIONS.NEEDS_APPROVAL, reasonCodes, checks, 'Trust score needs an operator decision.');
  }
  reasonCodes.push(REASON_CODES.TRUST_SCORE_OK);

  checks.evidenceFresh = isEvidenceFresh(identity, policy, now);
  if (action.requiresFreshEvidence && !checks.evidenceFresh) {
    reasonCodes.push(REASON_CODES.EVIDENCE_STALE_OR_MISSING);
    return staleEvidenceDecision(identity, action, options, policy, now, reasonCodes, checks);
  }
  if (action.requiresFreshEvidence) reasonCodes.push(REASON_CODES.EVIDENCE_FRESH);

  checks.actionCostUsd = action.costUsd;
  checks.actionCostUsdValid = action.costUsdValid;
  if (!action.costUsdValid) {
    reasonCodes.push(REASON_CODES.INVALID_ACTION_COST_USD);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Action costUsd must be a finite non-negative number.');
  }

  checks.maxAutoSpendUsd = policy.maxAutoSpendUsd;
  const settlement = getX402Settlement(options);
  let settlementAllowsPayment = false;
  if (settlement && action.costUsd > 0) {
    const settlementResult = validateX402Settlement({
      settlement,
      identity,
      action,
      purpose: 'action_payment',
      expectedResource: action.resource,
      expectedCostUsd: action.costUsd,
      now,
      policy,
    });
    checks.x402Settlement = settlementResult.check;
    if (!settlementResult.ok) {
      reasonCodes.push(settlementResult.reasonCode);
      return decision(DECISIONS.DENY, reasonCodes, checks, settlementResult.message);
    }
    settlementAllowsPayment = true;
    reasonCodes.push(REASON_CODES.X402_SETTLEMENT_VERIFIED);
    reasonCodes.push(REASON_CODES.X402_SETTLEMENT_IS_NOT_TASK_OUTCOME_PROOF);
    reasonCodes.push(REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
  }
  if (checks.actionCostUsd > checks.maxAutoSpendUsd
      && options.actionPaymentPreapproved !== true
      && !settlementAllowsPayment) {
    reasonCodes.push(REASON_CODES.ACTION_PAYMENT_NEEDS_APPROVAL);
    return decision(DECISIONS.NEEDS_APPROVAL, reasonCodes, checks, 'Paid action exceeds local auto-spend policy.');
  }
  if (checks.actionCostUsd > 0 && !settlementAllowsPayment) {
    reasonCodes.push(REASON_CODES.ACTION_PAYMENT_PREAPPROVED);
    reasonCodes.push(REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
  }

  if (action.protectedTool && action.operatorApprovalRequired && options.operatorApproved !== true) {
    reasonCodes.push(REASON_CODES.PROTECTED_TOOL_REQUIRES_APPROVAL);
    return decision(DECISIONS.NEEDS_APPROVAL, reasonCodes, checks, 'Protected tool requires operator approval.');
  }

  reasonCodes.push(REASON_CODES.LOCAL_POLICY_ALLOW);
  return decision(DECISIONS.ALLOW, reasonCodes, checks, 'Local runtime policy allows the action.');
}

function buildRuntimePolicyAuditTrace(identityPayload, actionDescriptor, options = {}) {
  const result = options.result || evaluateRuntimePolicy(identityPayload, actionDescriptor, options);
  const identity = normalizeIdentity(identityPayload);
  const action = normalizeAction(actionDescriptor);

  return {
    schemaVersion: RUNTIME_POLICY_AUDIT_TRACE_SCHEMA_VERSION,
    mode: 'offline-local-runtime-policy-trace',
    generatedAt: safeIsoDate(options.now),
    decision: result.decision,
    reasonCodes: result.reasonCodes.slice(),
    message: result.message,
    subject: {
      agentId: identity.agentId,
      subjectId: identity.subjectId,
      actorId: identity.actorId,
      actorEvidencePresent: identity.actorEvidence !== null,
      active: identity.active,
      verified: identity.verified,
      trustScoreBand: trustScoreBand(identity.trustScore),
      evidenceUpdatedAt: identity.evidenceUpdatedAt,
      capabilityCount: identity.capabilities.length,
    },
    action: {
      type: action.type,
      operation: action.operation,
      resourceKind: resourceKind(action.resource),
      resourceLabel: action.resourceLabel,
      requiresCapability: action.requiresCapability,
      requiresFreshEvidence: action.requiresFreshEvidence,
      protectedTool: action.protectedTool,
      operatorApprovalRequired: action.operatorApprovalRequired,
      costUsd: action.costUsd,
      evidenceLookup: action.evidenceLookup
        ? {
            type: action.evidenceLookup.type || null,
            configured: true,
            maxCostUsd: action.evidenceLookup.maxCostUsd ?? null,
          }
        : null,
    },
    checks: sanitizeAuditChecks(result.checks),
    guardrails: {
      localDecisionOnly: true,
      writesSolanaState: false,
      usesKeypairs: false,
      deploysPrograms: false,
      publishesPackages: false,
      authorizesPayment: false,
      authorizesAgentActionFromPayment: false,
    },
  };
}

function buildRuntimePolicyActionDescriptor(input = {}, overrides = {}) {
  const base = typeof input === 'string' ? { type: input } : input;
  if (!base || typeof base !== 'object' || Array.isArray(base)) {
    throw new Error('runtime policy action descriptor input must be an object or action type string');
  }
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new Error('runtime policy action descriptor overrides must be an object');
  }

  const action = { ...base, ...overrides };
  const type = action.type || action.surface || 'generic';
  const descriptor = {
    schemaVersion: RUNTIME_POLICY_HOST_ACTION_DESCRIPTOR_SCHEMA_VERSION,
    actionId: firstDefined(action.action_id, action.actionId, null),
    type,
    resource: firstDefined(action.resource, defaultResourceForAction(type, action)),
    operation: firstDefined(action.operation, defaultOperationForAction(type)),
    requiresCapability: firstDefined(action.requiresCapability, action.capability, defaultCapabilityForAction(type)),
    minimumTrustScore: firstDefined(action.minimumTrustScore, action.trustScoreMinimum, defaultMinimumTrustScoreForAction(type)),
    allowDegraded: firstDefined(action.allowDegraded, defaultAllowDegradedForAction(type)),
    requiresFreshEvidence: firstDefined(action.requiresFreshEvidence, defaultRequiresFreshEvidenceForAction(type)),
    costUsd: firstDefined(action.costUsd, defaultCostUsdForAction(type)),
    protectedTool: firstDefined(action.protectedTool, type === 'mcp_protected_tool'),
    operatorApprovalRequired: firstDefined(action.operatorApprovalRequired, false),
    guardrails: {
      localDecisionOnly: true,
      writesSolanaState: false,
      usesKeypairs: false,
      deploysPrograms: false,
      publishesPackages: false,
      livePaymentRequired: false,
    },
  };

  if (action.evidenceLookup !== undefined) descriptor.evidenceLookup = action.evidenceLookup;
  return descriptor;
}

function evaluateActorEvidence(identity, action, policy, now, reasonCodes, checks) {
  checks.subjectIdPresent = isNonEmptyString(identity.subjectId);
  if (!checks.subjectIdPresent) {
    reasonCodes.push(REASON_CODES.SUBJECT_ID_MISSING);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Explicit runtime context requires subject_id.');
  }

  checks.actorIdPresent = isNonEmptyString(identity.actorId);
  if (!checks.actorIdPresent) {
    reasonCodes.push(REASON_CODES.ACTOR_ID_MISSING);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Explicit runtime context requires actor_id.');
  }

  const evidence = normalizeActorEvidence(identity.actorEvidence);
  checks.actorEvidencePresent = evidence !== null;
  if (!evidence) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_MISSING);
    return decision(
      DECISIONS.NEEDS_APPROVAL,
      reasonCodes,
      checks,
      'Caller-supplied actor context is not authentication; verifier-produced actor_evidence is required.'
    );
  }

  checks.actorEvidenceRevoked = evidence.revoked;
  if (evidence.revoked) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_REVOKED);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Actor evidence has been revoked.');
  }

  checks.actorEvidenceVerified = evidence.verified && isNonEmptyString(evidence.verifierId);
  if (!checks.actorEvidenceVerified) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_UNVERIFIED);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Actor evidence was not produced and verified by a named verifier.');
  }
  reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_VERIFIED);

  if (evidence.actorId !== identity.actorId || evidence.subjectId !== identity.subjectId) {
    reasonCodes.push(REASON_CODES.ACTOR_SUBJECT_MISMATCH);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Actor evidence is not bound to the requested actor and subject.');
  }

  const evidenceFreshness = actorEvidenceFreshness(evidence, now, policy.maxActorEvidenceAgeMs);
  checks.actorEvidenceFresh = evidenceFreshness.fresh;
  if (!evidenceFreshness.fresh) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_STALE);
    return decision(DECISIONS.NEEDS_APPROVAL, reasonCodes, checks, evidenceFreshness.message);
  }
  reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_FRESH);

  if (!evidence.actionBinding) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_ACTION_UNBOUND);
    return decision(DECISIONS.NEEDS_APPROVAL, reasonCodes, checks, 'Actor evidence must bind the action being evaluated.');
  }
  checks.actorEvidenceActionBound = actionBindingMatches(evidence.actionBinding, action);
  if (!checks.actorEvidenceActionBound) {
    reasonCodes.push(REASON_CODES.ACTION_CONTEXT_MISMATCH);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Actor evidence action binding does not match the requested action.');
  }

  const delegationDepth = evidence.delegationDepth;
  checks.delegationDepth = delegationDepth;
  checks.maxDelegationDepth = policy.maxDelegationDepth;
  if (identity.actorId !== identity.subjectId && delegationDepth === null) {
    reasonCodes.push(REASON_CODES.DELEGATION_CONTEXT_MISSING);
    return decision(DECISIONS.NEEDS_APPROVAL, reasonCodes, checks, 'Delegated actor evidence must include delegation_depth.');
  }
  if (delegationDepth !== null
      && (!Number.isInteger(delegationDepth) || delegationDepth < 0 || delegationDepth > policy.maxDelegationDepth)) {
    reasonCodes.push(REASON_CODES.DELEGATION_DEPTH_EXCEEDED);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Actor evidence exceeds the local delegation-depth policy.');
  }

  return null;
}

function normalizeActorEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const delegation = value.delegation && typeof value.delegation === 'object' ? value.delegation : {};
  return {
    verifierId: firstDefined(value.verifier_id, value.verifierId, null),
    verified: value.verified === true,
    revoked: value.revoked === true,
    actorId: firstDefined(value.actor_id, value.actorId, null),
    subjectId: firstDefined(value.subject_id, value.subjectId, null),
    issuedAt: firstDefined(value.issued_at, value.issuedAt, null),
    expiresAt: firstDefined(value.expires_at, value.expiresAt, null),
    actionBinding: firstDefined(value.action_binding, value.actionBinding, null),
    delegationDepth: firstDefined(value.delegation_depth, value.delegationDepth, delegation.depth, null),
  };
}

function actorEvidenceFreshness(evidence, now, maxAgeMs) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return { fresh: false, message: 'Runtime policy evaluation time is invalid.' };
  }
  if (!evidence.issuedAt) return { fresh: false, message: 'Actor evidence is missing issued_at.' };
  const issuedAt = new Date(evidence.issuedAt);
  const expiresAt = evidence.expiresAt ? new Date(evidence.expiresAt) : null;
  if (Number.isNaN(issuedAt.getTime())) return { fresh: false, message: 'Actor evidence issued_at is invalid.' };
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { fresh: false, message: 'Actor evidence expires_at is invalid.' };
  const ageMs = now.getTime() - issuedAt.getTime();
  if (ageMs < 0 || ageMs > maxAgeMs || (expiresAt && expiresAt.getTime() <= now.getTime())) {
    return { fresh: false, message: 'Actor evidence is stale, expired, or future-dated.' };
  }
  return { fresh: true, message: null };
}

function actionBindingMatches(binding, action) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return false;
  const boundActionId = firstDefined(binding.action_id, binding.actionId, null);
  return isNonEmptyString(action.actionId)
    && boundActionId === action.actionId
    && binding.type === action.type
    && binding.operation === action.operation
    && binding.resource === action.resource;
}

function getX402Settlement(options) {
  return firstDefined(options.x402Settlement, options.x402_settlement, null);
}

function validateX402Settlement({
  settlement,
  identity,
  action,
  purpose,
  expectedResource,
  expectedCostUsd,
  maximumCostUsd = null,
  now,
  policy,
}) {
  const check = {
    present: true,
    verified: settlement && settlement.verified === true,
    verifierPresent: Boolean(settlement && isNonEmptyString(firstDefined(settlement.verifier_id, settlement.verifierId, null))),
    settlementIdPresent: Boolean(settlement && isNonEmptyString(firstDefined(settlement.settlement_id, settlement.settlementId, null))),
    purpose: settlement ? firstDefined(settlement.purpose, null) : null,
    status: settlement ? firstDefined(settlement.status, null) : null,
  };
  if (!settlement || typeof settlement !== 'object' || Array.isArray(settlement)
      || settlement.verified !== true
      || !check.verifierPresent
      || !check.settlementIdPresent
      || settlement.status !== 'settled') {
    return {
      ok: false,
      check,
      reasonCode: REASON_CODES.X402_SETTLEMENT_UNVERIFIED,
      message: 'x402 settlement context is not verifier-confirmed as settled.',
    };
  }

  const actorId = firstDefined(settlement.actor_id, settlement.actorId, null);
  const subjectId = firstDefined(settlement.subject_id, settlement.subjectId, null);
  const actionId = firstDefined(settlement.action_id, settlement.actionId, null);
  const resource = firstDefined(settlement.resource, null);
  const amountUsd = firstDefined(settlement.amount_usd, settlement.amountUsd, null);
  const settledAt = firstDefined(settlement.settled_at, settlement.settledAt, null);
  const settledDate = settledAt ? new Date(settledAt) : null;
  const ageMs = settledDate ? now.getTime() - settledDate.getTime() : Number.POSITIVE_INFINITY;
  const actionIdMatches = action.actionId === null ? actionId === null : actionId === action.actionId;
  const amountValid = typeof amountUsd === 'number'
    && Number.isFinite(amountUsd)
    && amountUsd >= expectedCostUsd
    && (maximumCostUsd === null || amountUsd <= maximumCostUsd);
  const timeValid = settledDate && !Number.isNaN(settledDate.getTime())
    && ageMs >= 0 && ageMs <= policy.maxSettlementAgeMs;

  Object.assign(check, {
    actorMatches: !identity.explicitActorContext || actorId === identity.actorId,
    subjectMatches: !identity.explicitActorContext || subjectId === identity.subjectId,
    actionMatches: actionIdMatches,
    resourceMatches: resource === expectedResource,
    amountCoversExpectedCost: amountValid,
    fresh: timeValid,
  });

  if (settlement.purpose !== purpose
      || !check.actorMatches
      || !check.subjectMatches
      || !check.actionMatches
      || !check.resourceMatches
      || !amountValid
      || !timeValid) {
    return {
      ok: false,
      check,
      reasonCode: REASON_CODES.X402_SETTLEMENT_CONTEXT_MISMATCH,
      message: 'x402 settlement is not bound to the actor, subject, action, resource, purpose, amount, and time being evaluated.',
    };
  }

  return { ok: true, check, reasonCode: null, message: null };
}

function staleEvidenceDecision(identity, action, options, policy, now, reasonCodes, checks) {
  const lookup = action.evidenceLookup || null;
  if (!lookup || lookup.type !== 'x402') {
    return decision(DECISIONS.DEGRADE, reasonCodes, checks, 'Evidence is stale or missing; no paid lookup path is configured.');
  }

  checks.evidenceLookup = {
    type: lookup.type,
    endpoint: lookup.endpoint || null,
    maxCostUsd: lookup.maxCostUsd ?? null,
  };

  const settlement = getX402Settlement(options);
  if (settlement) {
    const settlementResult = validateX402Settlement({
      settlement,
      identity,
      action,
      purpose: 'evidence_lookup',
      expectedResource: lookup.endpoint || null,
      expectedCostUsd: 0,
      maximumCostUsd: lookup.maxCostUsd ?? null,
      now,
      policy,
    });
    checks.x402Settlement = settlementResult.check;
    if (!settlementResult.ok) {
      reasonCodes.push(settlementResult.reasonCode);
      return decision(DECISIONS.DENY, reasonCodes, checks, settlementResult.message);
    }
    reasonCodes.push(REASON_CODES.X402_LOOKUP_SETTLEMENT_BOUND);
    reasonCodes.push(REASON_CODES.X402_SETTLEMENT_VERIFIED);
    reasonCodes.push(REASON_CODES.X402_SETTLEMENT_IS_NOT_TASK_OUTCOME_PROOF);
    reasonCodes.push(REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
    return decision(
      DECISIONS.DEGRADE,
      reasonCodes,
      checks,
      'x402 settlement covers the lookup only; refreshed evidence must still be verified before the action.'
    );
  }

  if (options.evidenceLookupPaymentPreapproved !== true) {
    reasonCodes.push(REASON_CODES.X402_LOOKUP_REQUIRES_APPROVAL);
    reasonCodes.push(REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
    return decision(DECISIONS.NEEDS_APPROVAL, reasonCodes, checks, 'Paid x402 evidence lookup requires approval before use.');
  }

  reasonCodes.push(REASON_CODES.X402_LOOKUP_PAYMENT_PREAPPROVED);
  reasonCodes.push(REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
  return decision(DECISIONS.DEGRADE, reasonCodes, checks, 'Paid lookup may refresh evidence, but does not authorize the agent action.');
}

function decision(value, reasonCodes, checks, message) {
  return {
    decision: value,
    reasonCodes: Array.from(new Set(reasonCodes)),
    message,
    checks,
  };
}

function normalizeIdentity(identity = {}) {
  const explicitActorContext = hasOwn(identity, 'subject_id')
    || hasOwn(identity, 'subjectId')
    || hasOwn(identity, 'actor_id')
    || hasOwn(identity, 'actorId')
    || hasOwn(identity, 'actor_evidence')
    || hasOwn(identity, 'actorEvidence');
  const subjectId = firstDefined(identity.subject_id, identity.subjectId, identity.agentId, identity.profileId, null);
  const actorId = firstDefined(identity.actor_id, identity.actorId, null);

  return {
    agentId: subjectId,
    subjectId,
    actorId,
    actorEvidence: firstDefined(identity.actor_evidence, identity.actorEvidence, null),
    explicitActorContext,
    active: identity.active !== false,
    verified: identity.verified === true || identity.satpVerified === true,
    trustScore: clampScore(identity.trustScore ?? identity.agentFolioTrustScore ?? 0),
    capabilities: Array.isArray(identity.capabilities) ? identity.capabilities.slice() : [],
    evidenceUpdatedAt: identity.evidenceUpdatedAt || identity.lastEvidenceAt || null,
  };
}

function normalizeAction(action = {}) {
  const parsedCost = parseActionCostUsd(action);

  return {
    actionId: firstDefined(action.action_id, action.actionId, null),
    type: action.type || 'generic',
    resource: action.resource || null,
    resourceLabel: action.resourceLabel || null,
    operation: action.operation || null,
    requiresCapability: action.requiresCapability || null,
    minimumTrustScore: Number.isFinite(action.minimumTrustScore) ? action.minimumTrustScore : null,
    allowDegraded: action.allowDegraded === true,
    requiresFreshEvidence: action.requiresFreshEvidence === true,
    evidenceLookup: action.evidenceLookup || null,
    protectedTool: action.protectedTool === true || action.type === 'mcp_protected_tool',
    operatorApprovalRequired: action.operatorApprovalRequired === true,
    costUsd: parsedCost.value,
    costUsdValid: parsedCost.valid,
  };
}

function parseActionCostUsd(action) {
  if (!Object.prototype.hasOwnProperty.call(action, 'costUsd') || action.costUsd == null) {
    return { value: 0, valid: true };
  }

  if (typeof action.costUsd !== 'number' || !Number.isFinite(action.costUsd) || action.costUsd < 0) {
    return { value: null, valid: false };
  }

  return { value: action.costUsd, valid: true };
}

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function trustScoreBand(score) {
  if (score >= 90) return '90-100';
  if (score >= 80) return '80-89';
  if (score >= 70) return '70-79';
  if (score >= 50) return '50-69';
  if (score >= 25) return '25-49';
  return '0-24';
}

function sanitizeAuditChecks(checks = {}) {
  const sanitized = { ...checks };
  if (sanitized.evidenceLookup && typeof sanitized.evidenceLookup === 'object') {
    sanitized.evidenceLookup = {
      type: sanitized.evidenceLookup.type || null,
      configured: true,
      maxCostUsd: sanitized.evidenceLookup.maxCostUsd ?? null,
    };
  }
  return sanitized;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function hasOwn(value, property) {
  return value !== null
    && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, property);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function defaultResourceForAction(type, action) {
  if (type === 'mcp_protected_tool') return 'mcp://protected/tool';
  if (TRUST_SCORE_GATE_TYPES.has(type)) {
    if (action.profileId) {
      return `https://agentfolio.bot/api/profile/${encodeURIComponent(String(action.profileId))}/trust-score`;
    }
    return 'https://agentfolio.bot/api/profile/:id/trust-score';
  }
  if (type === 'x402_endpoint') return 'x402://paid-endpoint';
  return null;
}

function defaultOperationForAction(type) {
  if (type === 'mcp_protected_tool') return 'invoke';
  if (TRUST_SCORE_GATE_TYPES.has(type)) return 'trust-score-read';
  if (type === 'x402_endpoint') return 'lookup';
  return null;
}

function defaultCapabilityForAction(type) {
  if (TRUST_SCORE_GATE_TYPES.has(type)) return 'agentfolio:trust-read';
  return null;
}

function defaultMinimumTrustScoreForAction(type) {
  if (TRUST_SCORE_GATE_TYPES.has(type)) return DEFAULT_POLICY.minimumTrustScore;
  return null;
}

function defaultAllowDegradedForAction(type) {
  return TRUST_SCORE_GATE_TYPES.has(type);
}

function defaultRequiresFreshEvidenceForAction(type) {
  return type === 'mcp_protected_tool' || TRUST_SCORE_GATE_TYPES.has(type);
}

function defaultCostUsdForAction(type) {
  if (type === 'x402_endpoint') return 0;
  return 0;
}

function normalizePolicy(policy) {
  if (policy === undefined) return {};
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('runtime policy adapter policy must be an object');
  }
  return { ...policy };
}

function applyDefaultActionType(input, defaultActionType) {
  if (!defaultActionType || typeof input === 'string') return input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  if (input.type || input.surface) return input;
  return { type: defaultActionType, ...input };
}

function resolveAdapterNow(nowProvider, methodNow) {
  if (methodNow !== undefined) return methodNow;
  if (typeof nowProvider === 'function') return nowProvider();
  return nowProvider;
}

function isValidDateInput(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function attachRedactedResourceLabel(actionDescriptor, redact) {
  if (!actionDescriptor || typeof actionDescriptor !== 'object' || Array.isArray(actionDescriptor)) {
    return actionDescriptor;
  }
  if (typeof actionDescriptor.resource !== 'string') return actionDescriptor;
  const redacted = redact(actionDescriptor.resource);
  return {
    ...actionDescriptor,
    resourceLabel: typeof redacted === 'string' ? redacted : '[redacted]',
  };
}

function explainRuntimePolicyResult(result = {}) {
  const reasonCodes = Array.isArray(result.reasonCodes) ? result.reasonCodes : [];
  return reasonCodes.map((code) => RUNTIME_POLICY_EXPLANATIONS[code] || `Runtime policy returned ${code}.`);
}

const RUNTIME_POLICY_EXPLANATIONS = Object.freeze({
  [REASON_CODES.ACTOR_EVIDENCE_ACTION_UNBOUND]: 'Verifier-produced actor evidence is not bound to an action.',
  [REASON_CODES.ACTOR_EVIDENCE_FRESH]: 'Verifier-produced actor evidence is within the local freshness window.',
  [REASON_CODES.ACTOR_EVIDENCE_MISSING]: 'Caller-supplied actor context is not authentication; actor evidence is required.',
  [REASON_CODES.ACTOR_EVIDENCE_REVOKED]: 'Verifier-produced actor evidence has been revoked.',
  [REASON_CODES.ACTOR_EVIDENCE_STALE]: 'Verifier-produced actor evidence is stale, expired, missing a timestamp, or future-dated.',
  [REASON_CODES.ACTOR_EVIDENCE_UNVERIFIED]: 'Actor evidence is not verified by a named verifier.',
  [REASON_CODES.ACTOR_EVIDENCE_VERIFIED]: 'A named verifier authenticated the actor evidence.',
  [REASON_CODES.ACTOR_ID_MISSING]: 'Explicit runtime context requires actor_id.',
  [REASON_CODES.ACTOR_SUBJECT_MISMATCH]: 'Actor evidence is bound to a different actor or subject.',
  [REASON_CODES.ACTION_PAYMENT_NEEDS_APPROVAL]: 'The action cost exceeds the host auto-spend policy and needs approval.',
  [REASON_CODES.ACTION_PAYMENT_PREAPPROVED]: 'The host preapproved payment for this action.',
  [REASON_CODES.ACTION_CONTEXT_MISMATCH]: 'Actor evidence is bound to a different action.',
  [REASON_CODES.DELEGATION_CONTEXT_MISSING]: 'Delegated actor evidence is missing its delegation depth.',
  [REASON_CODES.DELEGATION_DEPTH_EXCEEDED]: 'The actor evidence exceeds the local delegation-depth limit.',
  [REASON_CODES.EVIDENCE_FRESH]: 'The identity evidence is fresh enough for this action.',
  [REASON_CODES.EVIDENCE_STALE_OR_MISSING]: 'The identity evidence is stale or missing.',
  [REASON_CODES.IDENTITY_INACTIVE]: 'The identity is inactive.',
  [REASON_CODES.IDENTITY_UNVERIFIED]: 'The identity is not verified by the host policy.',
  [REASON_CODES.INVALID_ACTION_COST_USD]: 'The action cost must be a finite non-negative number.',
  [REASON_CODES.LOCAL_POLICY_ALLOW]: 'The local host policy allows the action.',
  [REASON_CODES.MISSING_CAPABILITY]: 'The identity is missing the capability required by this action.',
  [REASON_CODES.PROTECTED_TOOL_REQUIRES_APPROVAL]: 'The protected tool requires operator approval.',
  [REASON_CODES.SUBJECT_ID_MISSING]: 'Explicit runtime context requires subject_id.',
  [REASON_CODES.TRUST_SCORE_BELOW_DENY_FLOOR]: 'The trust score is below the host deny floor.',
  [REASON_CODES.TRUST_SCORE_BELOW_MINIMUM]: 'The trust score is below the minimum for this action.',
  [REASON_CODES.TRUST_SCORE_OK]: 'The trust score satisfies the local policy.',
  [REASON_CODES.X402_LOOKUP_PAYMENT_PREAPPROVED]: 'The host preapproved payment for the x402 evidence lookup.',
  [REASON_CODES.X402_LOOKUP_REQUIRES_APPROVAL]: 'The x402 evidence lookup requires payment approval.',
  [REASON_CODES.X402_LOOKUP_SETTLEMENT_BOUND]: 'A verified x402 settlement is bound to the optional evidence lookup.',
  [REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION]: 'x402 payment does not authorize the agent action.',
  [REASON_CODES.X402_SETTLEMENT_CONTEXT_MISMATCH]: 'The x402 settlement does not match the evaluated actor, subject, action, resource, purpose, amount, or time.',
  [REASON_CODES.X402_SETTLEMENT_IS_NOT_TASK_OUTCOME_PROOF]: 'x402 settlement proves payment only, not successful task execution.',
  [REASON_CODES.X402_SETTLEMENT_UNVERIFIED]: 'The x402 settlement is not verifier-confirmed as settled.',
  [REASON_CODES.X402_SETTLEMENT_VERIFIED]: 'The x402 settlement is verifier-confirmed and context-bound.',
});

function safeIsoDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function resourceKind(resource) {
  if (!resource || typeof resource !== 'string') return null;
  const schemeMatch = resource.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) return `${schemeMatch[1].toLowerCase()}:`;
  if (resource.startsWith('/')) return 'path';
  return 'opaque';
}

function isEvidenceFresh(identity, policy, now) {
  if (!identity.evidenceUpdatedAt) return false;
  const updatedAt = new Date(identity.evidenceUpdatedAt);
  if (Number.isNaN(updatedAt.getTime())) return false;
  const ageMs = now.getTime() - updatedAt.getTime();
  if (ageMs < 0) return false;
  return ageMs <= policy.staleEvidenceAfterMs;
}

module.exports = {
  DECISIONS,
  DEFAULT_POLICY,
  REASON_CODES,
  RUNTIME_POLICY_AUDIT_TRACE_SCHEMA_VERSION,
  RUNTIME_POLICY_HOST_ACTION_DESCRIPTOR_SCHEMA_VERSION,
  buildRuntimePolicyActionDescriptor,
  buildRuntimePolicyAuditTrace,
  createRuntimePolicyAdapter,
  evaluateRuntimePolicy,
};

'use strict';

const DECISIONS = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
  DEGRADE: 'degrade',
  NEEDS_APPROVAL: 'needs_approval',
});

const REASON_CODES = Object.freeze({
  ACTION_CONTEXT_MISMATCH: 'ACTION_CONTEXT_MISMATCH',
  ACTION_ID_MISSING: 'ACTION_ID_MISSING',
  ACTION_PAYMENT_NEEDS_APPROVAL: 'ACTION_PAYMENT_NEEDS_APPROVAL',
  ACTION_PAYMENT_PREAPPROVED: 'ACTION_PAYMENT_PREAPPROVED',
  ACTOR_EVIDENCE_ACTOR_MISMATCH: 'ACTOR_EVIDENCE_ACTOR_MISMATCH',
  ACTOR_EVIDENCE_MISSING: 'ACTOR_EVIDENCE_MISSING',
  ACTOR_EVIDENCE_REVOKED: 'ACTOR_EVIDENCE_REVOKED',
  ACTOR_EVIDENCE_STALE: 'ACTOR_EVIDENCE_STALE',
  ACTOR_EVIDENCE_SUBJECT_MISMATCH: 'ACTOR_EVIDENCE_SUBJECT_MISMATCH',
  ACTOR_EVIDENCE_UNVERIFIED: 'ACTOR_EVIDENCE_UNVERIFIED',
  ACTOR_EVIDENCE_VERIFIED: 'ACTOR_EVIDENCE_VERIFIED',
  ACTOR_ID_MISSING: 'ACTOR_ID_MISSING',
  DELEGATION_DEPTH_EXCEEDED: 'DELEGATION_DEPTH_EXCEEDED',
  DELEGATION_DEPTH_OK: 'DELEGATION_DEPTH_OK',
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
  X402_LOOKUP_CONTEXT_MISMATCH: 'X402_LOOKUP_CONTEXT_MISMATCH',
  X402_LOOKUP_REQUIRES_APPROVAL: 'X402_LOOKUP_REQUIRES_APPROVAL',
  X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION: 'X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION',
  X402_SETTLEMENT_CONTEXT_MISMATCH: 'X402_SETTLEMENT_CONTEXT_MISMATCH',
  X402_SETTLEMENT_NOT_TASK_OUTCOME_PROOF: 'X402_SETTLEMENT_NOT_TASK_OUTCOME_PROOF',
  X402_SETTLEMENT_UNVERIFIED: 'X402_SETTLEMENT_UNVERIFIED',
});

const DEFAULT_POLICY = Object.freeze({
  actorEvidenceStaleAfterMs: 15 * 60 * 1000,
  minimumTrustScore: 70,
  denyTrustScoreBelow: 25,
  maxDelegationDepth: 1,
  maxAutoSpendUsd: 0,
  requireVerifiedIdentity: true,
  staleEvidenceAfterMs: 7 * 24 * 60 * 60 * 1000,
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

    evaluateContext(runtimeContext, options = {}) {
      return evaluateRuntimePolicyContext(runtimeContext, adapterOptions(options));
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

function evaluateRuntimePolicyContext(runtimeContext = {}, options = {}) {
  const policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
  const now = options.now ? new Date(options.now) : new Date();
  const context = normalizeRuntimePolicyContext(runtimeContext);
  const reasonCodes = [];
  const checks = {
    subjectId: context.subjectId,
    actorId: context.actorId,
    actionId: context.actionId,
  };

  if (!context.subjectId) {
    reasonCodes.push(REASON_CODES.SUBJECT_ID_MISSING);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Runtime policy context requires subject_id.');
  }
  if (!context.actorId) {
    reasonCodes.push(REASON_CODES.ACTOR_ID_MISSING);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Runtime policy context requires actor_id.');
  }
  if (!context.actionId) {
    reasonCodes.push(REASON_CODES.ACTION_ID_MISSING);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Runtime policy context requires action.action_id.');
  }

  const evidence = context.actorEvidence;
  if (!evidence) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_MISSING);
    return decision(
      DECISIONS.NEEDS_APPROVAL,
      reasonCodes,
      checks,
      'Caller-supplied actor context is not authenticated without verifier-produced actor_evidence.'
    );
  }

  checks.actorEvidenceVerifierId = nonEmptyString(evidence.verifier_id);
  checks.actorEvidenceAuthenticated = evidence.authenticated === true;
  if (!checks.actorEvidenceVerifierId || !checks.actorEvidenceAuthenticated || !isValidDateInput(evidence.verified_at)) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_UNVERIFIED);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'actor_evidence is not verifier-authenticated.');
  }
  if (evidence.revoked === true) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_REVOKED);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'actor_evidence has been revoked.');
  }
  if (nonEmptyString(evidence.actor_id) !== context.actorId) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_ACTOR_MISMATCH);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'actor_evidence does not bind the authenticated actor_id.');
  }
  if (nonEmptyString(evidence.subject_id) !== context.subjectId) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_SUBJECT_MISMATCH);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'actor_evidence does not bind the requested subject_id.');
  }

  checks.actorEvidenceFresh = isActorEvidenceFresh(evidence, policy, now);
  if (!checks.actorEvidenceFresh) {
    reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_STALE);
    return decision(DECISIONS.NEEDS_APPROVAL, reasonCodes, checks, 'actor_evidence is stale, expired, or future-dated.');
  }
  reasonCodes.push(REASON_CODES.ACTOR_EVIDENCE_VERIFIED);

  const delegationDepth = normalizeDelegationDepth(evidence.delegation_depth);
  checks.delegationDepth = delegationDepth;
  checks.maxDelegationDepth = policy.maxDelegationDepth;
  if (
    delegationDepth === null
    || !Number.isInteger(policy.maxDelegationDepth)
    || policy.maxDelegationDepth < 0
    || delegationDepth > policy.maxDelegationDepth
  ) {
    reasonCodes.push(REASON_CODES.DELEGATION_DEPTH_EXCEEDED);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Delegation depth exceeds local policy or is invalid.');
  }
  reasonCodes.push(REASON_CODES.DELEGATION_DEPTH_OK);

  if (evidence.action_id !== undefined && nonEmptyString(evidence.action_id) !== context.actionId) {
    reasonCodes.push(REASON_CODES.ACTION_CONTEXT_MISMATCH);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'actor_evidence action binding does not match action.action_id.');
  }

  const expectedBinding = {
    subject_id: context.subjectId,
    actor_id: context.actorId,
    action_id: context.actionId,
    resource: context.action.resource || null,
  };
  if (context.x402Lookup && !matchesRuntimeBinding(context.x402Lookup, expectedBinding)) {
    reasonCodes.push(REASON_CODES.X402_LOOKUP_CONTEXT_MISMATCH);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'x402 lookup context is not bound to the subject, actor, and action.');
  }
  if (context.x402Settlement && !matchesRuntimeBinding(context.x402Settlement, expectedBinding)) {
    reasonCodes.push(REASON_CODES.X402_SETTLEMENT_CONTEXT_MISMATCH);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'x402 settlement context is not bound to the subject, actor, and action.');
  }

  let settlementVerified = false;
  if (context.x402Settlement) {
    settlementVerified = context.x402Settlement.status === 'settled'
      && Boolean(nonEmptyString(context.x402Settlement.verified_by));
    checks.x402SettlementVerified = settlementVerified;
    checks.taskOutcomeProvenBySettlement = false;
    reasonCodes.push(REASON_CODES.X402_SETTLEMENT_NOT_TASK_OUTCOME_PROOF);
    reasonCodes.push(REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION);
    if (!settlementVerified) {
      reasonCodes.push(REASON_CODES.X402_SETTLEMENT_UNVERIFIED);
      return decision(DECISIONS.NEEDS_APPROVAL, reasonCodes, checks, 'x402 settlement is unverified and cannot satisfy payment policy.');
    }
  }

  const verifiedIdentity = {
    ...context.subject,
    agentId: context.subjectId,
    capabilities: Array.isArray(evidence.capabilities) ? evidence.capabilities.slice() : [],
  };
  const action = context.x402Lookup && !context.action.evidenceLookup
    ? {
        ...context.action,
        evidenceLookup: {
          type: 'x402',
          endpoint: context.x402Lookup.endpoint || null,
          maxCostUsd: context.x402Lookup.max_cost_usd ?? null,
        },
      }
    : context.action;
  const result = evaluateRuntimePolicy(verifiedIdentity, action, {
    ...options,
    actionPaymentPreapproved: options.actionPaymentPreapproved === true || settlementVerified,
    evidenceLookupPaymentPreapproved: options.evidenceLookupPaymentPreapproved === true
      || (context.x402Lookup && context.x402Lookup.payment_preapproved === true),
  });

  return {
    ...result,
    reasonCodes: Array.from(new Set([...reasonCodes, ...result.reasonCodes])),
    checks: { ...checks, ...result.checks },
  };
}

function evaluateRuntimePolicy(identityPayload, actionDescriptor, options = {}) {
  const policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
  const now = options.now ? new Date(options.now) : new Date();
  const identity = normalizeIdentity(identityPayload);
  const action = normalizeAction(actionDescriptor);
  const reasonCodes = [];
  const checks = {};

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
    return staleEvidenceDecision(action, options, reasonCodes, checks);
  }
  if (action.requiresFreshEvidence) reasonCodes.push(REASON_CODES.EVIDENCE_FRESH);

  checks.actionCostUsd = action.costUsd;
  checks.actionCostUsdValid = action.costUsdValid;
  if (!action.costUsdValid) {
    reasonCodes.push(REASON_CODES.INVALID_ACTION_COST_USD);
    return decision(DECISIONS.DENY, reasonCodes, checks, 'Action costUsd must be a finite non-negative number.');
  }

  checks.maxAutoSpendUsd = policy.maxAutoSpendUsd;
  if (checks.actionCostUsd > checks.maxAutoSpendUsd && options.actionPaymentPreapproved !== true) {
    reasonCodes.push(REASON_CODES.ACTION_PAYMENT_NEEDS_APPROVAL);
    return decision(DECISIONS.NEEDS_APPROVAL, reasonCodes, checks, 'Paid action exceeds local auto-spend policy.');
  }
  if (checks.actionCostUsd > 0) {
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
    action_id: firstDefined(action.action_id, action.actionId, null),
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

function staleEvidenceDecision(action, options, reasonCodes, checks) {
  const lookup = action.evidenceLookup || null;
  if (!lookup || lookup.type !== 'x402') {
    return decision(DECISIONS.DEGRADE, reasonCodes, checks, 'Evidence is stale or missing; no paid lookup path is configured.');
  }

  checks.evidenceLookup = {
    type: lookup.type,
    endpoint: lookup.endpoint || null,
    maxCostUsd: lookup.maxCostUsd ?? null,
  };

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
  return {
    agentId: identity.agentId || identity.profileId || null,
    active: identity.active !== false,
    verified: identity.verified === true || identity.satpVerified === true,
    trustScore: clampScore(identity.trustScore ?? identity.agentFolioTrustScore ?? 0),
    capabilities: Array.isArray(identity.capabilities) ? identity.capabilities.slice() : [],
    evidenceUpdatedAt: identity.evidenceUpdatedAt || identity.lastEvidenceAt || null,
  };
}

function normalizeRuntimePolicyContext(context = {}) {
  const safeContext = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
  const subject = safeObject(safeContext.subject || safeContext.subject_identity);
  const actor = safeObject(safeContext.actor);
  const action = safeObject(safeContext.action);
  const x402 = safeObject(safeContext.x402);

  return {
    subject,
    subjectId: nonEmptyString(safeContext.subject_id) || nonEmptyString(subject.subject_id) || nonEmptyString(subject.agentId),
    actor,
    actorId: nonEmptyString(safeContext.actor_id) || nonEmptyString(actor.actor_id),
    actorEvidence: safeContext.actor_evidence && typeof safeContext.actor_evidence === 'object'
      && !Array.isArray(safeContext.actor_evidence)
      ? safeContext.actor_evidence
      : null,
    action,
    actionId: nonEmptyString(action.action_id),
    x402Lookup: x402.lookup && typeof x402.lookup === 'object' && !Array.isArray(x402.lookup)
      ? x402.lookup
      : null,
    x402Settlement: x402.settlement && typeof x402.settlement === 'object' && !Array.isArray(x402.settlement)
      ? x402.settlement
      : null,
  };
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeDelegationDepth(value) {
  if (value === undefined || value === null) return 0;
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function isActorEvidenceFresh(evidence, policy, now) {
  const verifiedAt = new Date(evidence.verified_at);
  if (Number.isNaN(verifiedAt.getTime())) return false;
  const ageMs = now.getTime() - verifiedAt.getTime();
  if (ageMs < 0 || ageMs > policy.actorEvidenceStaleAfterMs) return false;
  if (evidence.expires_at !== undefined && evidence.expires_at !== null) {
    const expiresAt = new Date(evidence.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return false;
  }
  return true;
}

function matchesRuntimeBinding(binding, expected) {
  for (const key of ['subject_id', 'actor_id', 'action_id']) {
    if (nonEmptyString(binding[key]) !== expected[key]) return false;
  }
  if (expected.resource !== null && binding.resource !== undefined && binding.resource !== expected.resource) return false;
  return true;
}

function normalizeAction(action = {}) {
  const parsedCost = parseActionCostUsd(action);

  return {
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
  [REASON_CODES.ACTION_CONTEXT_MISMATCH]: 'The verifier-produced action binding does not match the requested action.',
  [REASON_CODES.ACTION_ID_MISSING]: 'The runtime context is missing action.action_id.',
  [REASON_CODES.ACTION_PAYMENT_NEEDS_APPROVAL]: 'The action cost exceeds the host auto-spend policy and needs approval.',
  [REASON_CODES.ACTION_PAYMENT_PREAPPROVED]: 'The host preapproved payment for this action.',
  [REASON_CODES.ACTOR_EVIDENCE_ACTOR_MISMATCH]: 'The actor evidence is bound to a different actor.',
  [REASON_CODES.ACTOR_EVIDENCE_MISSING]: 'Verifier-produced actor evidence is required before actor context can be trusted.',
  [REASON_CODES.ACTOR_EVIDENCE_REVOKED]: 'The actor evidence has been revoked.',
  [REASON_CODES.ACTOR_EVIDENCE_STALE]: 'The actor evidence is stale, expired, or future-dated.',
  [REASON_CODES.ACTOR_EVIDENCE_SUBJECT_MISMATCH]: 'The actor evidence is bound to a different subject.',
  [REASON_CODES.ACTOR_EVIDENCE_UNVERIFIED]: 'The actor evidence is not authenticated by a named verifier.',
  [REASON_CODES.ACTOR_EVIDENCE_VERIFIED]: 'The actor evidence is authenticated, fresh, and bound to this request.',
  [REASON_CODES.ACTOR_ID_MISSING]: 'The runtime context is missing actor_id.',
  [REASON_CODES.DELEGATION_DEPTH_EXCEEDED]: 'The delegation depth is invalid or exceeds local policy.',
  [REASON_CODES.DELEGATION_DEPTH_OK]: 'The delegation depth satisfies local policy.',
  [REASON_CODES.EVIDENCE_FRESH]: 'The identity evidence is fresh enough for this action.',
  [REASON_CODES.EVIDENCE_STALE_OR_MISSING]: 'The identity evidence is stale or missing.',
  [REASON_CODES.IDENTITY_INACTIVE]: 'The identity is inactive.',
  [REASON_CODES.IDENTITY_UNVERIFIED]: 'The identity is not verified by the host policy.',
  [REASON_CODES.INVALID_ACTION_COST_USD]: 'The action cost must be a finite non-negative number.',
  [REASON_CODES.LOCAL_POLICY_ALLOW]: 'The local host policy allows the action.',
  [REASON_CODES.MISSING_CAPABILITY]: 'The identity is missing the capability required by this action.',
  [REASON_CODES.PROTECTED_TOOL_REQUIRES_APPROVAL]: 'The protected tool requires operator approval.',
  [REASON_CODES.SUBJECT_ID_MISSING]: 'The runtime context is missing subject_id.',
  [REASON_CODES.TRUST_SCORE_BELOW_DENY_FLOOR]: 'The trust score is below the host deny floor.',
  [REASON_CODES.TRUST_SCORE_BELOW_MINIMUM]: 'The trust score is below the minimum for this action.',
  [REASON_CODES.TRUST_SCORE_OK]: 'The trust score satisfies the local policy.',
  [REASON_CODES.X402_LOOKUP_PAYMENT_PREAPPROVED]: 'The host preapproved payment for the x402 evidence lookup.',
  [REASON_CODES.X402_LOOKUP_CONTEXT_MISMATCH]: 'The x402 lookup is not bound to this subject, actor, and action.',
  [REASON_CODES.X402_LOOKUP_REQUIRES_APPROVAL]: 'The x402 evidence lookup requires payment approval.',
  [REASON_CODES.X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION]: 'x402 payment does not authorize the agent action.',
  [REASON_CODES.X402_SETTLEMENT_CONTEXT_MISMATCH]: 'The x402 settlement is not bound to this subject, actor, and action.',
  [REASON_CODES.X402_SETTLEMENT_NOT_TASK_OUTCOME_PROOF]: 'x402 settlement proves payment only, not task outcome.',
  [REASON_CODES.X402_SETTLEMENT_UNVERIFIED]: 'The x402 settlement has not been verified by the host.',
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
  evaluateRuntimePolicyContext,
};

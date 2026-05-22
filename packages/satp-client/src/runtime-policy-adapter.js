'use strict';

const DECISIONS = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
  DEGRADE: 'degrade',
  NEEDS_APPROVAL: 'needs_approval',
});

const REASON_CODES = Object.freeze({
  ACTION_PAYMENT_NEEDS_APPROVAL: 'ACTION_PAYMENT_NEEDS_APPROVAL',
  ACTION_PAYMENT_PREAPPROVED: 'ACTION_PAYMENT_PREAPPROVED',
  EVIDENCE_FRESH: 'EVIDENCE_FRESH',
  EVIDENCE_STALE_OR_MISSING: 'EVIDENCE_STALE_OR_MISSING',
  IDENTITY_INACTIVE: 'IDENTITY_INACTIVE',
  IDENTITY_UNVERIFIED: 'IDENTITY_UNVERIFIED',
  INVALID_ACTION_COST_USD: 'INVALID_ACTION_COST_USD',
  LOCAL_POLICY_ALLOW: 'LOCAL_POLICY_ALLOW',
  MISSING_CAPABILITY: 'MISSING_CAPABILITY',
  PROTECTED_TOOL_REQUIRES_APPROVAL: 'PROTECTED_TOOL_REQUIRES_APPROVAL',
  TRUST_SCORE_BELOW_DENY_FLOOR: 'TRUST_SCORE_BELOW_DENY_FLOOR',
  TRUST_SCORE_BELOW_MINIMUM: 'TRUST_SCORE_BELOW_MINIMUM',
  TRUST_SCORE_OK: 'TRUST_SCORE_OK',
  X402_LOOKUP_PAYMENT_PREAPPROVED: 'X402_LOOKUP_PAYMENT_PREAPPROVED',
  X402_LOOKUP_REQUIRES_APPROVAL: 'X402_LOOKUP_REQUIRES_APPROVAL',
  X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION: 'X402_PAYMENT_IS_NOT_ACTION_AUTHORIZATION',
});

const DEFAULT_POLICY = Object.freeze({
  minimumTrustScore: 70,
  denyTrustScoreBelow: 25,
  maxAutoSpendUsd: 0,
  requireVerifiedIdentity: true,
  staleEvidenceAfterMs: 7 * 24 * 60 * 60 * 1000,
});

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

function normalizeAction(action = {}) {
  const parsedCost = parseActionCostUsd(action);

  return {
    type: action.type || 'generic',
    resource: action.resource || null,
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
  evaluateRuntimePolicy,
};

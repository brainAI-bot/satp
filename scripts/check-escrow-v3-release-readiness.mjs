#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestRelativePath = 'docs/escrow-v3-deployed-truth.json';
const canonicalMainnetProgramId = 'HXCUWKR2NvRcZ7rNAJHwPcH6QAAWaLR4bRFbfyuDND6C';

const surfaceRoots = [
  'README.md',
  'ROADMAP.md',
  'docs',
  'examples',
  'packages',
];

const claimPatterns = [
  {
    label: 'release/mainnet/production-ready escrow claim',
    pattern: /\b(?:escrow[_ -]?v3|escrow)\s+(?:is|are|has been|is now|remains)\s+(?:fully\s+)?(?:release|mainnet|production)[ -]ready\b/i,
  },
  {
    label: 'release/mainnet/production-ready escrow label',
    pattern: /\b(?:release|mainnet|production)[ -]ready\s+(?:escrow[_ -]?v3|escrow)\b/i,
  },
  {
    label: 'escrow approval for release/mainnet/production',
    pattern: /\b(?:escrow[_ -]?v3|escrow)\s+(?:is|has been)\s+(?:approved|cleared|certified)\s+for\s+(?:release|mainnet|production)\b/i,
  },
  {
    label: 'resolved escrow provenance claim',
    pattern: /\b(?:escrow[_ -]?v3|escrow).{0,160}\bprovenance\s+(?:is|has been)\s+(?:complete|verified|resolved|reproducible)\b/is,
  },
  {
    label: 'resolved escrow provenance claim',
    pattern: /\bprovenance\s+(?:is|has been)\s+(?:complete|verified|resolved|reproducible)\b.{0,160}\b(?:escrow[_ -]?v3|escrow)\b/is,
  },
  {
    label: 'source/deployed equality claim',
    pattern: /\b(?:source|tracked source)\b.{0,100}\b(?:matches|equals|reproduces)\b.{0,100}\b(?:deployed|on-chain|mainnet)(?:\s+(?:bytes|binary|program|artifact))?\b/is,
  },
  {
    label: 'deployed/source equality claim',
    pattern: /\b(?:deployed|on-chain|mainnet)(?:\s+(?:bytes|binary|program|artifact))?\b.{0,100}\b(?:matches|equals|is reproduced by)\b.{0,100}\b(?:source|tracked source)\b/is,
  },
  {
    label: 'source/deployed/IDL certification claim',
    pattern: /\bsource\s*(?:==|=|equals)\s*deployed(?:\s+(?:bytes|binary))?\s*(?:==|=|equals)\s*(?:published\s+)?IDL\b/i,
  },
];

function collectMarkdownFiles(absolutePath) {
  const entries = readdirSync(absolutePath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const entryPath = join(absolutePath, entry.name);
    if (entry.isDirectory()) files.push(...collectMarkdownFiles(entryPath));
    if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') files.push(entryPath);
  }
  return files;
}

export function listReleaseReadinessSurfaces(repoRoot = root) {
  return surfaceRoots.flatMap((surface) => {
    const absolutePath = resolve(repoRoot, surface);
    return extname(surface) === '.md' ? [absolutePath] : collectMarkdownFiles(absolutePath);
  });
}

export function provenanceIsUnresolved(manifest) {
  return manifest?.status === 'provenance_gap' ||
    manifest?.conclusion?.published_idl_matches_canonical_repo_idl !== true ||
    manifest?.conclusion?.consumer_escrow_unpause_ready !== true;
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

function isFailClosedContext(text, match) {
  const sentenceBoundaryPattern = /[.!?](?:["')\]]*)?(?:\s+|$)|\n\s*\n|\n(?=\s*(?:[-*+]\s|\d+[.)]\s))/g;
  let contextStart = 0;
  for (const boundary of text.slice(0, match.index).matchAll(sentenceBoundaryPattern)) {
    contextStart = boundary.index + boundary[0].length;
  }
  const matchEnd = match.index + match[0].length;
  const nextBoundary = sentenceBoundaryPattern.exec(text.slice(matchEnd));
  const contextEnd = nextBoundary
    ? matchEnd + nextBoundary.index + nextBoundary[0].length
    : text.length;
  const context = text.slice(contextStart, contextEnd);
  return /\b(?:does not|do not|must not|cannot|never|unverified|unresolved|differ(?:s|ed|ent)?|provenance_gap|only when|until)\b/i.test(context);
}

export function findReleaseReadinessViolations(relativePath, text, manifest) {
  if (!provenanceIsUnresolved(manifest)) return [];

  const mentionsEscrowV3 = /\bescrow[_ -]?v3\b/i.test(text) || text.includes(canonicalMainnetProgramId);
  const violations = [];

  for (const { label, pattern } of claimPatterns) {
    const isEqualityClaim = label.includes('equality') || label.includes('certification');
    if (isEqualityClaim && !mentionsEscrowV3) continue;
    if (label !== 'source/deployed/IDL certification claim'
        && label.includes('equality')
        && manifest?.conclusion?.source_equals_deployed_binary === true) continue;
    const globalPattern = new RegExp(pattern.source, `${pattern.flags}g`);
    for (const match of text.matchAll(globalPattern)) {
      if (isEqualityClaim && isFailClosedContext(text, match)) continue;
      violations.push({
        file: relativePath,
        line: lineNumber(text, match.index),
        label,
        excerpt: match[0].replace(/\s+/g, ' ').trim(),
      });
    }
  }

  if (mentionsEscrowV3) {
    const statusMatch = /^status:\s*(?:release|mainnet|production)[ -]ready\b/im.exec(text);
    if (statusMatch) {
      violations.push({
        file: relativePath,
        line: lineNumber(text, statusMatch.index),
        label: 'release-ready document status while escrow_v3 provenance is unresolved',
        excerpt: statusMatch[0],
      });
    }
  }

  return violations;
}

export function assertEscrowV3ReleaseReadinessSurfaces(repoRoot = root) {
  const manifestPath = resolve(repoRoot, manifestRelativePath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const surfaces = listReleaseReadinessSurfaces(repoRoot);
  const violations = surfaces.flatMap((absolutePath) => {
    const relativePath = relative(repoRoot, absolutePath);
    return findReleaseReadinessViolations(relativePath, readFileSync(absolutePath, 'utf8'), manifest);
  });

  if (violations.length > 0) {
    const details = violations
      .map((violation) => `${violation.file}:${violation.line} ${violation.label}: ${violation.excerpt}`)
      .join('\n');
    throw new Error(
      `escrow_v3 release/readiness claims must fail closed while ${manifestRelativePath} ` +
      `records status=${manifest.status}, published-IDL match=` +
      `${manifest.conclusion?.published_idl_matches_canonical_repo_idl}, and consumer unpause=` +
      `${manifest.conclusion?.consumer_escrow_unpause_ready}\n${details}`
    );
  }

  return { manifest, surfaceCount: surfaces.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { manifest, surfaceCount } = assertEscrowV3ReleaseReadinessSurfaces();
    console.log(
      `escrow_v3 release/readiness guard OK: ${surfaceCount} surfaces; ` +
      `status=${manifest.status}; source/binary match=` +
      `${manifest.conclusion.source_equals_deployed_binary}; published-IDL match=` +
      `${manifest.conclusion.published_idl_matches_canonical_repo_idl}; consumer unpause=` +
      `${manifest.conclusion.consumer_escrow_unpause_ready}`
    );
  } catch (error) {
    console.error(`escrow_v3 release/readiness guard failed: ${error.message}`);
    process.exitCode = 1;
  }
}

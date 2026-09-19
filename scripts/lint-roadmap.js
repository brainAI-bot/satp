#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const VALID_ROADMAP_TAGS = ['shipped', 'in flight', 'pending', 'blocked', 'deferred', 'withdrawn'];
const COMPLETE_BANNER_RE = /Status:\s*COMPLETE\s*[·-]\s*(MONITORING|MAINTENANCE)/i;
const NON_CORE_MARKER = ' · non-core';
const META_SECTIONS = new Set(['status taxonomy', 'current state snapshot']);
const ITEM_RE = new RegExp(
  '^.+\\s\\[(' + VALID_ROADMAP_TAGS.join('|') + ')\\](\\s·\\sowner-gated)?\\s*$'
);
const ANY_TAG_RE = /\[[^\]]+\](\s·\sowner-gated)?\s*$/;
const REPO_PATH_PREFIXES = new Set([
  '.github', 'config', 'docs', 'examples', 'idls', 'packages', 'programs', 'scripts', 'tests',
]);

function cleanSection(value) {
  return String(value || '')
    .replace(/[✅🔧⛔🟡⏳🔒🔮]/g, '')
    .replace(/\*\*/g, '')
    .replace(new RegExp(String.fromCharCode(96), 'g'), '')
    .trim()
    .toLowerCase();
}

function collectRoadmapItems(lines) {
  const items = [];
  let section = null;
  let scope = 'core';
  let current = null;

  function flushCurrent() {
    if (!current) return;
    items.push(current);
    current = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      flushCurrent();
      section = cleanSection(heading[1]);
      scope = heading[1].endsWith(NON_CORE_MARKER) ? 'non-core' : 'core';
      continue;
    }

    if (!section || META_SECTIONS.has(section)) {
      flushCurrent();
      continue;
    }

    const bullet = line.match(/^\s*-\s+(.+?)\s*$/);
    if (bullet) {
      flushCurrent();
      current = { section, scope, line, lineNumber: index + 1, text: bullet[1].trim() };
      continue;
    }

    if (current && /^\s{2,}\S/.test(line)) {
      current.text += ' ' + line.trim();
      continue;
    }

    if (!line.trim()) flushCurrent();
  }

  flushCurrent();
  return items;
}

function stripPathDecoration(value) {
  return value
    .trim()
    .replace(/^\.\//, '')
    .split('#', 1)[0]
    .replace(/:[0-9]+(?:-[0-9]+)?$/, '');
}

function looksLikeRepoPath(value) {
  if (!value || /^(?:https?:|mailto:|#|@)/i.test(value) || value.includes('<') || /\s/.test(value)) {
    return false;
  }
  const candidate = stripPathDecoration(value);
  if (!candidate.includes('/')) return false;
  const first = candidate.replace(/^\.\.\//, '').split('/')[0];
  return REPO_PATH_PREFIXES.has(first);
}

function extractRepoPathCitations(markdown) {
  const citations = [];
  const patterns = [/`([^`\n]+)`/g, /\]\(([^)]+)\)/g];
  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      if (looksLikeRepoPath(match[1])) citations.push(match[1]);
    }
  }
  return [...new Set(citations)];
}

function readTruthValue(repoRoot, artifactPath, keyPath) {
  const absolute = path.resolve(repoRoot, artifactPath);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  let value = parsed;
  for (const key of keyPath.split('.')) {
    if (!value || !Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error('missing truth field ' + keyPath);
    }
    value = value[key];
  }
  if (typeof value !== 'boolean') throw new Error('truth field ' + keyPath + ' is not boolean');
  return value;
}

function checkTruthReferences(item, repoRoot, errors) {
  const truthReference = /([A-Za-z0-9_.\/-]+\.json)#(conclusion\.[A-Za-z0-9_]+)=(true|false)/g;
  for (const match of item.text.matchAll(truthReference)) {
    const [, artifactPath, keyPath, expectedText] = match;
    const expected = expectedText === 'true';
    try {
      const actual = readTruthValue(repoRoot, artifactPath, keyPath);
      if (actual !== expected) {
        const status = item.text.match(/\[([^\]]+)\](?:\s·\sowner-gated)?\s*$/)?.[1] || 'unknown';
        const prefix = status === 'blocked' ? 'blocked roadmap item contradicts deployed truth' : 'roadmap item contradicts deployed truth';
        errors.push(
          'line ' + item.lineNumber + ': ' + prefix + ': ' +
          artifactPath + '#' + keyPath + ' is ' + actual + ', cited as ' + expected
        );
      }
    } catch (error) {
      errors.push('line ' + item.lineNumber + ': invalid deployed-truth reference: ' + error.message);
    }
  }
}

function lintRoadmap(file, options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const markdown = fs.readFileSync(file, 'utf8');
  const errors = [];
  const lines = markdown.split(/\r?\n/);

  if (!/^##\s+Status taxonomy\s*$/im.test(markdown)) {
    errors.push('missing required "## Status taxonomy" section');
  }
  if (!/^##\s+Current state snapshot\s*$/im.test(markdown)) {
    errors.push('missing required "## Current state snapshot" section');
  }

  if (/Status:\s*COMPLETE/i.test(markdown) && !COMPLETE_BANNER_RE.test(markdown)) {
    errors.push('completion banner is malformed');
  }

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+(.+?)\s*$/);
    if (!heading) continue;

    const rawSection = heading[1];
    if (/\bnon[\s-]?core\b/i.test(rawSection) && !rawSection.endsWith(NON_CORE_MARKER)) {
      errors.push('line ' + (index + 1) + ': non-core marker must be exact "' + NON_CORE_MARKER + '"');
    }
  }

  for (const citation of extractRepoPathCitations(markdown)) {
    const citedPath = stripPathDecoration(citation);
    if (!fs.existsSync(path.resolve(repoRoot, citedPath))) {
      errors.push('cited repository path does not exist: ' + citedPath);
    }
  }

  const items = collectRoadmapItems(lines);
  for (const item of items) {
    if (!ANY_TAG_RE.test(item.text)) {
      errors.push(item.line + ': roadmap item missing valid trailing tag');
      continue;
    }
    if (!ITEM_RE.test(item.text)) {
      errors.push(item.line + ': invalid roadmap tag; valid tags are ' + VALID_ROADMAP_TAGS.join(', '));
      continue;
    }
    checkTruthReferences(item, repoRoot, errors);
  }

  if (COMPLETE_BANNER_RE.test(markdown)) {
    const coreOpen = items.filter((item) => {
      if (item.scope !== 'core') return false;
      const status = item.text.match(/\[([^\]]+)\](?:\s·\sowner-gated)?\s*$/)?.[1];
      return ['in flight', 'pending', 'blocked'].includes(status);
    });
    if (coreOpen.length) {
      errors.push('completion banner present but ' + coreOpen.length + ' core item(s) remain open');
    }
  }

  return errors;
}

function runCli(files = process.argv.slice(2)) {
  const defaultTargets = ['ROADMAP.md', 'docs/planning/ROADMAP.md'].filter((file) => fs.existsSync(file));
  const targets = files.length ? files : defaultTargets;
  let failed = false;

  for (const file of targets) {
    const errors = lintRoadmap(file);
    if (!errors.length) {
      console.log('roadmap lint passed: ' + path.relative(process.cwd(), file));
      continue;
    }

    failed = true;
    console.error('roadmap lint failed: ' + path.relative(process.cwd(), file));
    for (const error of errors) console.error('- ' + error);
  }

  return failed ? 1 : 0;
}

if (require.main === module) process.exit(runCli());

module.exports = {
  collectRoadmapItems,
  extractRepoPathCitations,
  lintRoadmap,
  readTruthValue,
  runCli,
};

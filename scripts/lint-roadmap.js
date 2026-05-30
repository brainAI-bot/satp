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

  for (const line of lines) {
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
      current = { section, scope, line, text: bullet[1].trim() };
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

function lintRoadmap(file) {
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

  const items = collectRoadmapItems(lines);
  for (const item of items) {
    if (!ANY_TAG_RE.test(item.text)) {
      errors.push(item.line + ': roadmap item missing valid trailing tag');
      continue;
    }
    if (!ITEM_RE.test(item.text)) {
      errors.push(item.line + ': invalid roadmap tag; valid tags are ' + VALID_ROADMAP_TAGS.join(', '));
    }
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

const files = process.argv.slice(2);
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

if (failed) process.exit(1);

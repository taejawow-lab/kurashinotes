#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'src', 'content', 'posts');

// Existing older posts still need a separate full localization pass. Keep this
// baseline explicit so newly generated Kurashinotes posts cannot copy the
// shared English template without failing CI/build checks.
const LEGACY_MIXED_LANGUAGE_SLUGS = new Set([
  'welcome',
  '30-day-declutter-challenge',
  'capsule-wardrobe-data',
  'capsule-wardrobe-japanese-style',
  'daily-routines-minimalism',
  'decluttering-psychology-data',
  'genkan-storage-minimalist-flow-checklist',
  'ikebana-flower-arranging',
  'j-beauty-skincare-routine',
  'japanese-notebook-systems',
  'japanese-storage-principles',
  'japanese-tea-ceremony-tools',
  'kitchen-drawer-organization',
  'konmari-2024-method-updated',
  'konmari-method-step-by-step',
  'minimalist-bedroom-japanese',
  'minimalist-kitchen-essentials',
  'muji-stationery-essentials',
  'shikiri-box-divider-system',
  'small-closet-organization-japanese',
  'tatami-floor-living-guide',
  'washi-paper-craft-guide',
]);

const FORBIDDEN_ENGLISH_BOILERPLATE = [
  'This guide is written',
  'Start by defining',
  'The field test',
  'Decision checklist',
  'This section turns the topic into a practical operating system',
  'The goal is not to buy more products',
];

function stripNonProse(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\/images\/\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*(heroImage|schemaType|sources|internalLinks|visualsCount|hasVideo|wordCount|affiliate|aiDisclosed):.*$/gm, ' ')
    .replace(/^\s*(-\s+)?(url|name|publisher|year):.*$/gm, ' ')
    .replace(/^\s*-\s+"\/[^"]+"\s*$/gm, ' ')
    .replace(/^\s*-\s+\{[^}]+\}\s*$/gm, ' ');
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function englishHeavyLines(text) {
  return text
    .split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .filter(({ line }) => !/^[-\s]*(title|description|category|tags|pubDate|updatedDate|question|answer):/.test(line))
    .filter(({ line }) => !line.includes('http'))
    .filter(({ line }) => {
      const latin = countMatches(line, /[A-Za-z]/g);
      const japanese = countMatches(line, /[\u3040-\u30ff\u3400-\u9fff]/g);
      return latin >= 25 && latin > japanese * 0.7;
    })
    .slice(0, 5);
}

function validatePost(filePath) {
  const slug = path.basename(filePath, '.mdx');
  if (LEGACY_MIXED_LANGUAGE_SLUGS.has(slug)) {
    return { slug, skipped: true, errors: [] };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const prose = stripNonProse(raw);
  const japaneseChars = countMatches(prose, /[\u3040-\u30ff\u3400-\u9fff]/g);
  const latinChars = countMatches(prose, /[A-Za-z]/g);
  const ratio = japaneseChars === 0 ? (latinChars > 0 ? Infinity : 0) : latinChars / japaneseChars;
  const errors = [];

  for (const phrase of FORBIDDEN_ENGLISH_BOILERPLATE) {
    if (raw.includes(phrase)) {
      errors.push(`forbidden English boilerplate: "${phrase}"`);
    }
  }

  if (japaneseChars < 400 && slug !== 'welcome') {
    errors.push(`too little Japanese prose: ${japaneseChars} Japanese characters`);
  }

  if (ratio > 0.12) {
    errors.push(`English/Japanese prose ratio too high: ${ratio.toFixed(2)} (${latinChars} Latin vs ${japaneseChars} Japanese chars)`);
  }

  const heavyLines = englishHeavyLines(prose);
  for (const item of heavyLines) {
    errors.push(`English-heavy line ${item.number}: ${item.line.slice(0, 140)}`);
  }

  return { slug, skipped: false, errors };
}

if (!fs.existsSync(POSTS_DIR)) {
  console.error(`Missing posts directory: ${POSTS_DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(POSTS_DIR)
  .filter((name) => name.endsWith('.mdx'))
  .map((name) => path.join(POSTS_DIR, name))
  .sort();

const results = files.map(validatePost);
const failures = results.filter((result) => result.errors.length > 0);
const skipped = results.filter((result) => result.skipped).map((result) => result.slug);

if (failures.length > 0) {
  console.error('Kurashinotes Japanese content lint failed. Article body and FAQ must be fully Japanese.');
  for (const failure of failures) {
    console.error(`\n${failure.slug}:`);
    for (const error of failure.errors) {
      console.error(`  - ${error}`);
    }
  }
  process.exit(1);
}

console.log(`Kurashinotes Japanese content lint passed for ${results.length - skipped.length} enforced posts.`);
if (skipped.length > 0) {
  console.log(`Legacy mixed-language baseline skipped: ${skipped.length} posts. Localize these separately, but do not add new exceptions.`);
}

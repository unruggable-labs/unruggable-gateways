import { CHAINS } from '../../src/chains.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

console.log("--------------------------------");
console.log("Available chain identifiers:")
console.log("--------------------------------");

const slugs = Object.keys(CHAINS)
  .map((k) => k.toLowerCase().replaceAll('_', '-'))
  .sort();

console.log(slugs);

console.log("--------------------------------");
console.log("Available arguments:")
console.log("--------------------------------");

const here = dirname(fileURLToPath(import.meta.url));
const servePath = resolve(here, '../../scripts/serve.ts');
const code = readFileSync(servePath, 'utf8');

// grab the args filter block
const start = code.indexOf('const args = process.argv.slice(2).filter((');
if (start < 0) throw new Error('args block not found');
const end = code.indexOf('});', start);
if (end < 0) throw new Error('args block end not found');
const block = code.slice(start, end + 3);

type Flag = { name: string; pattern?: string; comment?: string };

// helper: capture a comment only if it's on the first line inside the specific condition's block
function firstCommentAfter(pos: number): string | undefined {
  // find the closing ')' of the condition then the immediate '{'
  const afterCond = block.slice(pos);
  const mClose = afterCond.match(/\)\s*\{/);
  let iBrace: number | undefined;
  if (mClose) {
    iBrace = pos + (mClose.index || 0) + mClose[0].lastIndexOf('{');
  } else {
    // fallback: first '{' after the match
    const iAny = block.indexOf('{', pos);
    if (iAny < 0) return;
    iBrace = iAny;
  }
  const after = block.slice(iBrace + 1);
  // find the first non-empty line; if it's a comment, return it
  const lines = after.split('\n');
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const m = line.match(/^\s*\/\/\s*(.*)$/);
    return m?.[1]?.trim();
  }
  return;
}

// simple flags: x === '--flag'
const simple: Flag[] = Array.from(block.matchAll(/x === '(--[a-z-]+)'/g), (m) => ({
  name: m[1],
  comment: firstCommentAfter(m.index!),
}));

// regex flags: x.match(/^--foo(|=\d+)$/)
const regexFlags: Flag[] = Array.from(
  block.matchAll(/x\.match\(\s*\/\^(\-\-[a-z-]+)\(\|\=\\d\+\)\$\//g),
  (m) => ({
    name: m[1],
    pattern: `${m[1]}[=N]`,
    comment: firstCommentAfter(m.index!),
  })
);

const kvNumeric: Flag[] = Array.from(
  block.matchAll(/x\.match\(\s*\/\^(\-\-[a-z-]+)=/g),
  (m) => ({
    name: m[1],
    pattern: `${m[1]}=N`,
    comment: firstCommentAfter(m.index!),
  })
);

// special signing key pattern
const signingKey =
  /\/\^0x\[0-9a-f]\{64\}\$\/i/.test(block)
    ? [{ name: 'SIGNING_KEY', pattern: '0x<64-hex>', comment: 'Override signing key' }]
    : [];

const uniqBy = <T, K>(arr: T[], key: (t: T) => K) => {
  const seen = new Set<K>();
  return arr.filter((t) => (seen.has(key(t)) ? false : (seen.add(key(t)), true)));
};

const all = uniqBy<Flag, string>([...simple, ...regexFlags, ...kvNumeric, ...signingKey], (x) => x.name);

for (const f of all.sort((a, b) => a.name.localeCompare(b.name))) {
  const right = [f.pattern && `(${f.pattern})`, f.comment].filter(Boolean).join(' — ');
  console.log(`${f.name}${right ? '  ' + right : ''}`);
}
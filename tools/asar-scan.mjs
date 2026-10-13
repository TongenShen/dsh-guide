import fs from 'node:fs';

const ASAR = process.argv[2];
const NEEDLE = process.argv[3] ?? 'AGENTS.md';
const WITH_MODULES = process.argv[4] === 'all';
const buf = fs.readFileSync(ASAR);

// locate the asar JSON header robustly
const marker = Buffer.from('{"files":');
const start = buf.indexOf(marker);
if (start < 0) throw new Error('asar header marker not found');
let depth = 0, end = -1, inStr = false, esc = false;
for (let i = start; i < buf.length; i++) {
  const c = buf[i];
  if (inStr) {
    if (esc) esc = false;
    else if (c === 0x5c) esc = true;
    else if (c === 0x22) inStr = false;
    continue;
  }
  if (c === 0x22) inStr = true;
  else if (c === 0x7b) depth++;
  else if (c === 0x7d) { depth--; if (depth === 0) { end = i; break; } }
}
const header = JSON.parse(buf.slice(start, end + 1).toString('utf8'));
const dataOffset = 8 + buf.readUInt32LE(4);

const files = [];
(function walk(node, prefix) {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (entry.files) walk(entry, p);
    else if (typeof entry.offset === 'string') files.push({ path: p, size: entry.size, offset: Number(entry.offset) });
  }
})(header, '');

console.log(`asar header parsed: dataOffset=${dataOffset}, files=${files.length}`);

let hitCount = 0;
for (const f of files) {
  if (!/\.(js|mjs|cjs|ts)$/.test(f.path)) continue;
  if (f.path.includes('node_modules') && !WITH_MODULES) continue;
  if (f.size > 20_000_000) continue;
  const s = dataOffset + f.offset;
  const text = buf.slice(s, s + f.size).toString('utf8');
  const lower = text.toLowerCase();
  const needleLower = NEEDLE.toLowerCase();
  if (!lower.includes(needleLower)) continue;
  hitCount++;
  console.log('\n' + '='.repeat(90));
  console.log(`FILE: ${f.path}  (${f.size} bytes)`);
  let idx = 0, n = 0;
  while ((idx = lower.indexOf(needleLower, idx)) !== -1 && n < 8) {
    const ctx = text.slice(Math.max(0, idx - 300), idx + 200).replace(/\s+/g, ' ');
    console.log(`  [${idx}] ...${ctx}...`);
    idx += needleLower.length; n++;
  }
}
console.log(`\nfiles matching: ${hitCount}`);

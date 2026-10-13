import fs from 'node:fs';

const [ASAR, PATTERN] = process.argv.slice(2);
const re = new RegExp(PATTERN, 'g');
const buf = fs.readFileSync(ASAR);

const marker = Buffer.from('{"files":');
const start = buf.indexOf(marker);
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

for (const f of files) {
  if (!/\.(js|mjs|cjs|yml|yaml)$/.test(f.path)) continue;
  if (!f.path.startsWith('dsh/')) continue;
  if (f.size > 8_000_000) continue;
  const s = dataOffset + f.offset;
  const text = buf.slice(s, s + f.size).toString('utf8');
  const found = new Set();
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    found.add(m[1] ?? m[0]);
    if (found.size > 40) break;
  }
  if (found.size === 0) continue;
  if (f.path.includes('node_modules') && !f.path.includes('@deepseek-ai')) continue;
  if (f.path.includes('client-ui')) continue;
  if (f.path.includes('@deepseek-ai/dsh-client-')) continue;
  console.log(`\n### ${f.path}`);
  for (const v of found) console.log(`    ${v}`);
}

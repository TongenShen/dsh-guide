import fs from 'node:fs';

const [ASAR, PATTERN] = process.argv.slice(2);
const re = new RegExp(PATTERN);
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

const out = [];
(function walk(node, prefix) {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (entry.files) walk(entry, p);
    else if (re.test(p)) out.push({ path: p, size: entry.size });
  }
})(header, '');

out.sort((a, b) => a.path.localeCompare(b.path));
for (const f of out) console.log(`${String(f.size).padStart(7)}  ${f.path}`);
console.log(`\ntotal: ${out.length}`);

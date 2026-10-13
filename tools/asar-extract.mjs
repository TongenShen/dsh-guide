import fs from 'node:fs';

const [ASAR, TARGET, OUT] = process.argv.slice(2);
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

let node = header;
for (const part of TARGET.split('/')) {
  node = node?.files?.[part];
  if (!node) throw new Error(`not found: ${TARGET} (at ${part})`);
}
if (typeof node.offset !== 'string') throw new Error('target is a directory');
const s = dataOffset + Number(node.offset);
fs.writeFileSync(OUT, buf.slice(s, s + node.size));
console.log(`extracted ${TARGET} (${node.size} bytes) -> ${OUT}`);

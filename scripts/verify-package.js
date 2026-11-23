// Compare the packaged asar's renderer bundle against the fresh source build
// to confirm the latest code (monochrome theme + Ollama fix) made it in.
const asar = require('@electron/asar');
const crypto = require('crypto');

const asarPath = 'release/win-unpacked/resources/app.asar';
const files = asar.listPackage(asarPath);

function toPosix(f) {
  // entries look like \dist\renderer\assets\index.BGM-VOjn.js
  return f.split('\\').filter(Boolean).join('/');
}

// Simpler: extract the whole asar once, then compare files.
const os = require('os');
const path = require('path');
const fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmplx-asar-'));
asar.extractAll(asarPath, tmp);
console.log('extracted asar to', tmp);

const indexFiles = files.filter((f) => /index\..+\.(js|css)$/.test(f.split('\\').pop() || ''));

let mismatch = false;
for (const f of indexFiles) {
  const p = toPosix(f);
  const inAsarBuf = fs.readFileSync(path.join(tmp, 'dist', 'renderer', 'assets', f.split('\\').pop()));
  const inAsar = crypto.createHash('sha1').update(inAsarBuf).digest('hex').slice(0, 16);
  // p is like dist/renderer/assets/index.BGM-VOjn.js — read from repo root
  const src = p;
  const inSrc = crypto.createHash('sha1').update(fs.readFileSync(src)).digest('hex').slice(0, 16);
  const ok = inAsar === inSrc;
  if (!ok) mismatch = true;
  console.log((ok ? 'MATCH   ' : 'MISMATCH') + ' ' + p + '  asar=' + inAsar + '  src=' + inSrc);
}
// also verify main/preload (files live at dist/main, dist/preload inside the asar)
for (const rel of ['main/ollamaService.js', 'main/main.js', 'preload/preload.js']) {
  const a = crypto.createHash('sha1').update(fs.readFileSync(path.join(tmp, 'dist', rel))).digest('hex').slice(0, 16);
  const s = crypto.createHash('sha1').update(fs.readFileSync('dist/' + rel)).digest('hex').slice(0, 16);
  const ok = a === s;
  if (!ok) mismatch = true;
  console.log((ok ? 'MATCH   ' : 'MISMATCH') + rel + '  asar=' + a + '  src=' + s);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(mismatch ? 'RESULT: FAIL' : 'RESULT: OK (packaged == fresh source build)');
process.exit(mismatch ? 1 : 0);
// End-to-end verification of CMPLX Studio main-process services.
// Run with: npx electron scripts/verify-e2e.js
// Exercises the real filesystem, settings and sessions services against disk.
// Exits non-zero on any failure.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

app.whenReady().then(async () => {
  let failures = 0;
  const results = [];

  function check(name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(() => { results.push(['PASS', name]); })
      .catch((e) => { results.push(['FAIL', name, e.message]); failures++; });
  }

  const fsService = require('../dist/main/fsService.js');
  const settingsService = require('../dist/main/settingsService.js');
  const sessionsService = require('../dist/main/sessionsService.js');
  const pty = require('node-pty');

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cmplx-e2e-'));
  fsService.setWorkspaceRoot(sandbox);

  await check('read empty project directory', async () => {
    const res = await fsService.readDirectoryImpl({ path: '' });
    assert(res && res.root, 'readDirectory failed');
    assert(Array.isArray(res.root.children), 'root children should be an array');
  });

  await check('create a file', async () => {
    await fsService.createFileImpl({ path: 'src/app.ts', content: 'export const a = 1;' });
    assert(fs.readFileSync(path.join(sandbox, 'src/app.ts'), 'utf8') === 'export const a = 1;');
  });

  await check('read a file', async () => {
    const value = await fsService.readFileImpl({ path: 'src/app.ts' });
    assert(value === 'export const a = 1;');
  });

  await check('write a file (save)', async () => {
    await fsService.writeFileImpl({ path: 'src/app.ts', content: 'export const b = 2;' });
    assert(fs.readFileSync(path.join(sandbox, 'src/app.ts'), 'utf8') === 'export const b = 2;');
  });

  await check('create a directory', async () => {
    await fsService.createDirectoryImpl({ path: 'lib' });
    assert(fs.statSync(path.join(sandbox, 'lib')).isDirectory());
  });

  await check('rename a file', async () => {
    await fsService.renameImpl({ oldPath: 'src/app.ts', newName: 'main.ts' });
    assert(fs.existsSync(path.join(sandbox, 'src/main.ts')));
    assert(!fs.existsSync(path.join(sandbox, 'src/app.ts')));
  });

  await check('delete a file', async () => {
    await fsService.deletePathImpl({ path: 'src/main.ts' });
    assert(!fs.existsSync(path.join(sandbox, 'src/main.ts')));
  });

  await check('block path traversal outside workspace', async () => {
    let threw = false;
    try { await fsService.readFileImpl({ path: '../settings.json' }); } catch { threw = true; }
    assert(threw, 'should block traversal');
  });

  await check('block absolute path outside workspace', async () => {
    let threw = false;
    try { await fsService.readFileImpl({ path: 'C:/Windows/win.ini' }); } catch { threw = true; }
    assert(threw, 'should block absolute external path');
  });

  await check('create a pty terminal and read live output', async () => {
    // Use the platform's real default shell (mirroring terminalService.ts) so
    // this runs on both Windows and Linux CI runners.
    const win32 = process.platform === 'win32';
    const shell = win32 ? (process.env.COMSPEC || 'powershell.exe') : (process.env.SHELL || '/bin/bash');
    const eol = win32 ? '\r\n' : '\n';
    const p = pty.spawn(shell, [], { cwd: sandbox, cols: 80, rows: 24 });
    const got = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('pty output timeout')), 15000);
      p.onData((d) => {
        if (d.includes('CMPlxTESTOK')) { clearTimeout(t); resolve(true); }
      });
      p.write(`echo CMPlxTESTOK${eol}`);
    });
    p.kill();
    assert(got === true);
  });

  await check('persist settings to disk', async () => {
    await settingsService.updateSettings({ ollamaEndpoint: 'http://127.0.0.1:1234', fontSize: 16 });
    const s = await settingsService.getSettings();
    assert(s.ollamaEndpoint === 'http://127.0.0.1:1234');
    assert(s.fontSize === 16);
  });

  await check('persist and reload a conversation session', async () => {
    const id = sessionsService.newSessionId();
    await sessionsService.saveSession(id, [
      { id: '1', role: 'user', content: 'hi', timestamp: Date.now() },
      { id: '2', role: 'assistant', content: 'hello', timestamp: Date.now() }
    ]);
    const loaded = await sessionsService.loadSession(id);
    assert(loaded && loaded.messages.length === 2);
    const list = await sessionsService.listSessions();
    assert(list.some((m) => m.id === id));
    await sessionsService.deleteSession(id);
    assert((await sessionsService.loadSession(id)) === null);
  });

  console.log('\n=== CMPLX STUDIO E2E RESULTS ===');
  for (const r of results) {
    console.log(r[0].padEnd(5), r[0] === 'FAIL' ? `${r[1]} :: ${r[2]}` : r[1]);
  }
  console.log(`\n${results.length - failures}/${results.length} passed`);

  app.exit(failures > 0 ? 1 : 0);
});
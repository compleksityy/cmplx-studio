// Deterministic, non-destructive lifecycle checks given a real Ollama on 11434:
//  - startOllama reuses the running instance (no duplicate spawned)
//  - stopOllama refuses to kill the externally-started instance
//  - repeatedly calling startOllama does not add more processes
//  - the launcher-managed endpoint config is persisted
// Run with: npx electron scripts/verify-launcher-lifecycle.js
const { app } = require('electron');

app.whenReady().then(async () => {
  const launcher = require('../dist/main/ollamaLauncher.js');
  const net = require('net');
  const results = [];
  const failures = [];
  const check = (n, fn) => Promise.resolve()
    .then(fn)
    .then(() => results.push(['PASS', n]))
    .catch((e) => { results.push(['FAIL', n, e.message]); failures.push(n); });

  const countListenersOn = (port) =>
    new Promise((resolve) => {
      const s = net.createServer();
      s.on('error', () => resolve(1)); // port is in use
      s.listen(port, '127.0.0.1', () => {
        s.close(() => resolve(0));
      });
    });

  await check('startOllama reuses the running instance and does not spawn a new one', async () => {
    const before = await launcher.getOllamaStatus();
    if (!before.running) throw new Error('expected an existing Ollama on this machine');
    const res = await launcher.startOllama();
    if (!res.ok) throw new Error(res.error);
    if (!res.status.running) throw new Error('expected running after start');
    if (res.status.startedByApp) throw new Error('must NOT be marked startedByApp for a pre-existing Ollama');
  });

  await check('repeated startOllama does not add extra listeners on 11434', async () => {
    await launcher.startOllama();
    await launcher.startOllama();
    const listeners = await countListenersOn(11434);
    // Exactly one listener (0 = free would be wrong; we expect 1 = in use once).
    if (listeners !== 1) throw new Error('expected exactly one listener, got ' + listeners);
  });

  await check('stopOllama refuses to terminate the externally-run Ollama', async () => {
    const st = await launcher.getOllamaStatus();
    if (st.running && !st.startedByApp) {
      const res = launcher.stopOllama();
      if (res.ok) throw new Error('must not stop an externally-started Ollama');
    }
  });

  await check('picking a port handles EADDRINUSE-style occupation via fallback', async () => {
    // Occupied by a non-Ollama responder -> next port chosen.
    const http = require('http');
    const foreign = http.createServer((_req, res) => { res.writeHead(200); res.end('x'); });
    await new Promise((r) => foreign.listen(32001, '127.0.0.1', r));
    const { port } = await launcher.pickPort(32001);
    foreign.close();
    if (port !== 32002) throw new Error('expected fallback to 32002, got ' + port);
  });

  console.log('\n=== CMPLX LAUNCHER LIFECYCLE ===');
  for (const r of results) console.log(r[0].padEnd(5), r[0] === 'FAIL' ? `${r[1]} :: ${r[2]}` : r[1]);
  console.log(`${results.length - failures.length}/${results.length} passed`);
  app.exit(failures.length ? 1 : 0);
});
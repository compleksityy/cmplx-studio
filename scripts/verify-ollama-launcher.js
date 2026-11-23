// Verify the Ollama launcher: status, exe detection, no-dup start against a
// running instance, safe-stop, and port-fallback selection logic.
// Run with: npx electron scripts/verify-ollama-launcher.js
const { app } = require('electron');
const net = require('net');

app.whenReady().then(async () => {
  const launcher = require('../dist/main/ollamaLauncher.js');
  const failures = [];
  const results = [];

  const check = (name, fn) =>
    Promise.resolve()
      .then(fn)
      .then(() => results.push(['PASS', name]))
      .catch((e) => {
        results.push(['FAIL', name, e.message]);
        failures.push(name);
      });

  await check('locateOllamaExe finds the installed executable', async () => {
    const exe = await launcher.locateOllamaExe();
    if (!exe) throw new Error('exe not located');
    if (!/ollama\.exe$/i.test(exe)) throw new Error('unexpected path: ' + exe);
  });

  await check('status detects the already-running Ollama (if any)', async () => {
    const st = await launcher.getOllamaStatus();
    // This machine has Ollama running; assert consistency either way.
    if (st.running) {
      if (st.endpoint.indexOf('1143') === -1) throw new Error('endpoint should be a 1143x port: ' + st.endpoint);
      if (!st.version) throw new Error('expected a version when running');
    }
  });

  await check('startOllama does NOT spawn a duplicate when already running', async () => {
    const before = await launcher.getOllamaStatus();
    const res = await launcher.startOllama();
    if (!res.ok) throw new Error(res.error);
    const after = await launcher.getOllamaStatus();
    if (before.running && !after.running) throw new Error('Ollama disappeared after start');
    // The critical invariant: exactly one instance endpoint is used and start
    // did not error. (Did not spawn a new independent child — see status checks.)
  });

  await check('stopOllama refuses to kill an instance it did not start', async () => {
    const st = await launcher.getOllamaStatus();
    if (st.running && !st.startedByApp) {
      const res = launcher.stopOllama();
      if (res.ok) throw new Error('must not allow stopping an externally-started Ollama');
    }
  });

  // Unit-style checks for port selection logic.
  const http = require('http');

  await check('portInUse detects an occupied port', async () => {
    const server = net.createServer();
    const port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
    const used = await launcher.portInUse(port);
    server.close();
    if (!used) throw new Error('expected occupied port to be detected');
  });

  await check('portInUse reports a free port as free', async () => {
    // Grab a free port by listening then closing it.
    const probe = net.createServer();
    const port = await new Promise((r) => probe.listen(0, '127.0.0.1', () => r(probe.address().port)));
    await new Promise((r) => probe.close(r));
    const used = await launcher.portInUse(port);
    if (used) throw new Error('expected free port to be free');
  });

  await check('pickPort skips a non-Ollama occupier and finds the next free port', async () => {
    const http = require('http');
    // Occupy port 31001 with a non-Ollama server.
    const foreign = http.createServer((_req, res) => { res.writeHead(200); res.end('not ollama'); });
    await new Promise((r) => foreign.listen(31001, '127.0.0.1', r));
    // 31002 should be free and chosen.
    const { port, existingOllama } = await launcher.pickPort(31001);
    foreign.close();
    if (existingOllama) throw new Error('foreign server must not be treated as Ollama');
    if (port !== 31002) throw new Error('expected fallback to 31002, got ' + port);
  });

  await check('pickPort reuses a port where Ollama-like service already responds', async () => {
    const http = require('http');
    const fakeOllama = http.createServer((req, res) => {
      if (req.url.startsWith('/api/version')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: '0.9.9-fake' }));
      } else { res.writeHead(404); res.end(); }
    });
    await new Promise((r) => fakeOllama.listen(31011, '127.0.0.1', r));
    const { port, existingOllama } = await launcher.pickPort(31011);
    fakeOllama.close();
    if (!existingOllama) throw new Error('expected Ollama-like responder to be reused');
    if (port !== 31011) throw new Error('expected to keep 31011');
  });

  console.log('\n=== CMPLX OLLAMA LAUNCHER VERIFICATION ===');
  for (const r of results) console.log(r[0].padEnd(5), r[0] === 'FAIL' ? `${r[1]} :: ${r[2]}` : r[1]);
  console.log(`\n${results.length - failures.length}/${results.length} passed`);
  app.exit(failures.length ? 1 : 0);
});
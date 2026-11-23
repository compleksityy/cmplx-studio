// Ollama integration verification against a local mock server.
// Run with: npx electron scripts/verify-ollama.js
const { app } = require('electron');
const http = require('http');

app.whenReady().then(async () => {
  const ollama = require('../dist/main/ollamaService.js');
  let failures = 0;
  const results = [];

  function check(name, fn) {
    return Promise.resolve().then(fn)
      .then(() => results.push(['PASS', name]))
      .catch((e) => { results.push(['FAIL', name, e.message]); failures++; });
  }

  // --- Mock Ollama server matching the real /api endpoints ---
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      // /api/version
      if (req.url.startsWith('/api/version')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: 'mock' }));
        return;
      }
      // /api/tags
      if (req.url.startsWith('/api/tags')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          models: [
            { name: 'qwen3-coder:30b', modified_at: '2025-01-01', size: 123, digest: 'abc', details: { parameter_size: '30B' } },
            { name: 'llama3.2:3b', modified_at: '2025-01-02', size: 456, digest: 'def', details: { parameter_size: '3B' } }
          ]
        }));
        return;
      }
      // /api/chat (streaming JSON lines)
      if (req.url.startsWith('/api/chat')) {
        const payload = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        const words = ['Hello', ' from', ' CMPLX', ' Studio'];
        let i = 0;
        const timer = setInterval(() => {
          if (i < words.length) {
            res.write(JSON.stringify({ model: payload.model, message: { content: words[i] }, done: false }) + '\n');
            i++;
          } else {
            res.write(JSON.stringify({ done: true }) + '\n');
            clearInterval(timer);
            res.end();
          }
        }, 30);
        return;
      }
      res.writeHead(404); res.end();
    });
  });

  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  const endpoint = `http://127.0.0.1:${port}`;

  await check('checkOllama connects', async () => {
    const ok = await ollama.checkOllama(endpoint);
    if (!ok) throw new Error('expected running status');
  });

  await check('checkOllama reports offline for a closed port', async () => {
    const ok = await ollama.checkOllama('http://127.0.0.1:1');
    if (ok) throw new Error('expected offline');
  });

  await check('listModels returns available models', async () => {
    const models = await ollama.listModels(endpoint);
    if (!models.some((m) => m.name === 'qwen3-coder:30b')) throw new Error('missing expected model');
  });

  await check('listModels returns objects the selector can render (name field)', async () => {
    const models = await ollama.listModels(endpoint);
    // The renderer maps over models and renders m.name, so every entry must
    // be an object carrying a non-empty name string.
    if (!Array.isArray(models)) throw new Error('expected an array');
    for (const m of models) {
      if (typeof m?.name !== 'string' || m.name.length === 0) {
        throw new Error('model entry missing renderable name: ' + JSON.stringify(m));
      }
    }
  });

  await check('listModels handles a tags response with no models key', async () => {
    const bare = http.createServer((req, res) => {
      if (req.url.startsWith('/api/tags')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: undefined }));
      } else { res.writeHead(404); res.end(); }
    });
    const p = await new Promise((r) => bare.listen(0, '127.0.0.1', () => r(bare.address().port)));
    const models = await ollama.listModels(`http://127.0.0.1:${p}`);
    bare.close();
    if (!Array.isArray(models) || models.length !== 0) throw new Error('expected empty array for missing models key');
  });

  await check('listModels surfaces an HTTP error instead of hiding it', async () => {
    const fail = http.createServer((_req, res) => { res.writeHead(500); res.end('boom'); });
    const p = await new Promise((r) => fail.listen(0, '127.0.0.1', () => r(fail.address().port)));
    let threw = false;
    try { await ollama.listModels(`http://127.0.0.1:${p}`); } catch { threw = true; }
    fail.close();
    if (!threw) throw new Error('expected listModels to reject on HTTP 500');
  });

  await check('streamChat delivers deltas and completion', async () => {
    let acc = '';
    const done = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('stream timeout: got "' + acc + '"')), 5000);
      ollama.streamChat(endpoint, 'qwen3-coder:30b', [
        { id: 'u1', role: 'user', content: 'hi', timestamp: Date.now() }
      ], (d) => { acc += d; }).then(() => { clearTimeout(t); resolve(true); });
    });
    const ok = await done;
    if (!ok) throw new Error('stream did not settle');
    if (!acc.includes('Hello from CMPLX Studio')) throw new Error('deltas missing: ' + JSON.stringify(acc));
  });

  await check('streamChat sends project context as a system message', async () => {
    // Capture the request payload that streamChat sends.
    let capturedPayload = null;
    const client = http.createServer((req, res) => {
      if (req.url.startsWith('/api/chat')) {
        let b = '';
        req.on('data', (c) => (b += c));
        req.on('end', () => {
          capturedPayload = JSON.parse(b);
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
          res.write(JSON.stringify({ done: true }) + '\n');
          res.end();
        });
      } else { res.writeHead(404); res.end(); }
    });
    const ctxPort = await new Promise((r) => client.listen(0, '127.0.0.1', () => r(client.address().port)));
    await ollama.streamChat(`http://127.0.0.1:${ctxPort}`, 'qwen3-coder:30b',
      [{ id: 'u', role: 'user', content: 'x', timestamp: Date.now() }],
      () => {},
      'PROJECT CONTEXT: root / src / main.ts'
    );
    client.close();
    if (!capturedPayload) throw new Error('no payload captured');
    const sys = (capturedPayload.messages || []).find((m) => m.role === 'system');
    if (!sys) throw new Error('no system message with context');
    if (!/PROJECT CONTEXT/.test(sys.content)) throw new Error('context not injected');
  });

  console.log('\n=== CMPLX OLLAMA VERIFICATION ===');
  for (const r of results) console.log(r[0].padEnd(5), r[0] === 'FAIL' ? `${r[1]} :: ${r[2]}` : r[1]);
  console.log(`\n${results.length - failures}/${results.length} passed`);
  server.close();
  app.exit(failures > 0 ? 1 : 0);
});
// Verify model discovery against the real, running Ollama instance.
// Run with: npx electron scripts/verify-live-ollama.js
const { app } = require('electron');

const ENDPOINT = process.env.CMPLX_OLLAMA || 'http://localhost:11434';

app.whenReady().then(async () => {
  const ollama = require('../dist/main/ollamaService.js');
  const results = [];

  try {
    const connected = await ollama.checkOllama(ENDPOINT);
    results.push(['PASS', `connected to ${ENDPOINT}`, connected]);
    if (!connected) results.push(['FAIL', 'expected Ollama online', '']);

    const models = await ollama.listModels(ENDPOINT);
    results.push(['PASS', 'listModels returned ' + models.length + ' model(s)', JSON.stringify(models.map((m) => m.name))]);

    const names = models.map((m) => m.name);
    if (!names.includes('qwen3:8b')) results.push(['FAIL', 'missing qwen3:8b', '']);
    if (!names.includes('qwen3-coder:30b')) results.push(['FAIL', 'missing qwen3-coder:30b', '']);
    if (!names.includes('qwen3-coder:latest')) results.push(['FAIL', 'missing qwen3-coder:latest', '']);
    if (names.length === 3) results.push(['PASS', 'all 3 expected models present', names.join(', ')]);

    if (models[0]) {
      const hasName = typeof models[0].name === 'string';
      const hasDetails = models[0].details && typeof models[0].details.parameter_size === 'string';
      results.push(['PASS', `model shape has name + details (parameter_size=${hasDetails ? models[0].details.parameter_size : 'n/a'})`, '']);
    }

    // Verify streaming chat works against the live model.
    let acc = '';
    const streamOk = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 30000);
      ollama.streamChat(ENDPOINT, 'qwen3-coder:30b', [
        { id: 'u', role: 'user', content: 'Reply with exactly: CMPlxOK', timestamp: Date.now() }
      ], (d) => { acc += d; }).then(() => { clearTimeout(t); resolve(true); }).catch(() => resolve(false));
    });
    results.push([streamOk ? 'PASS' : 'FAIL', 'live streaming chat', streamOk ? 'got ' + acc.length + ' chars' : 'stream failed']);
    if (acc.includes('CMPlxOK')) results.push(['PASS', 'streamed response contains expected token', '']);
  } catch (e) {
    results.push(['FAIL', 'unexpected error', e.message]);
  }

  console.log('\n=== CMPLX LIVE OLLAMA VERIFICATION ===');
  let failures = 0;
  for (const [status, name, detail] of results) {
    console.log(status.padEnd(5), name + (detail ? ' :: ' + detail : ''));
    if (status === 'FAIL') failures++;
  }
  console.log(`\n${results.length - failures}/${results.length} passed`);
  app.exit(failures > 0 ? 1 : 0);
});
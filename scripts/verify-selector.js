// End-to-end: verify the model selector populates with live Ollama models.
// Run with: npx electron scripts/verify-selector.js  (requires Ollama running)
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  console.log('USERDATA', app.getPath('userData'));
  let win = null;
  require('../dist/main/fsService.js').registerFsHandlers();
  require('../dist/main/settingsService.js').registerSettingsHandlers();
  require('../dist/main/sessionsService.js').registerSessionsHandlers();
  require('../dist/main/ollamaService.js').registerOllamaHandlers(() => win);
  require('../dist/main/terminalService.js').registerTerminalHandlers();

  win = new BrowserWindow({
    width: 1440, height: 900, show: true,
    webPreferences: {
      preload: path.join(__dirname, '../dist/preload/preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });

  await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
  await new Promise((r) => setTimeout(r, 4000));

  const report = await win.webContents.executeJavaScript(`(async () => {
    const sel = document.querySelector('.model-select');
    const s = await window.cmplx.settingsGet();
    const check = await window.cmplx.ollamaCheck(s.value.ollamaEndpoint);
    const models = await window.cmplx.ollamaListModels(s.value.ollamaEndpoint);
    return {
      settings: s,
      bridgeCheck: check,
      bridgeModels: models,
      options: sel ? Array.from(sel.options).map(o => o.text) : [],
      value: sel ? sel.value : null,
      statusDot: document.querySelector('.status-dot') ? document.querySelector('.status-dot').className : null
    };
  })()`);

  console.log('RENDER_ERRORS', JSON.stringify(errors));
  console.log('REPORT', JSON.stringify(report, null, 2));
  app.exit(0);
});
// Verify the Start Ollama button renders with the correct state + label, and
// that clicking it works against the real launcher.
// Run with: npx electron scripts/verify-start-btn.js  (Ollama running recommended)
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  let win = null;
  require('../dist/main/fsService.js').registerFsHandlers();
  require('../dist/main/ollamaService.js').registerOllamaHandlers(() => win);
  require('../dist/main/ollamaLauncher.js').registerOllamaLauncherHandlers();
  require('../dist/main/settingsService.js').registerSettingsHandlers();
  require('../dist/main/sessionsService.js').registerSessionsHandlers();
  require('../dist/main/terminalService.js').registerTerminalHandlers();

  win = new BrowserWindow({ width: 1440, height: 900, show: true, webPreferences: {
    preload: path.join(__dirname, '../dist/preload/preload.js'),
    contextIsolation: true, nodeIntegration: false
  } });
  const errors = [];
  win.webContents.on('console-message', (_e, l, m) => { if (l >= 3) errors.push(m); });
  await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
  await new Promise((r) => setTimeout(r, 3500));

  const before = await win.webContents.executeJavaScript(`(() => {
    const btn = document.querySelector('.ollama-launch-btn');
    const statusText = (document.querySelector('.status-text') || {}).textContent || '';
    return {
      hasButton: !!btn,
      label: btn ? btn.textContent.trim() : null,
      statusText,
      statusDot: document.querySelector('.status-dot') ? document.querySelector('.status-dot').className : null,
      models: Array.from(document.querySelectorAll('.model-select option')).map(o => o.text)
    };
  })()`);

  // Now toggle: if offline, Start; if running (running-ours not possible when
  // externally running), just verify refresh path. Click the button.
  await win.webContents.executeJavaScript(`document.querySelector('.ollama-launch-btn').click()`);
  await new Promise((r) => setTimeout(r, 2500));
  const after = await win.webContents.executeJavaScript(`(() => {
    const btn = document.querySelector('.ollama-launch-btn');
    return {
      label: btn ? btn.textContent.trim() : null,
      cls: btn ? btn.className : null,
      statusText: (document.querySelector('.status-text') || {}).textContent || '',
      models: Array.from(document.querySelectorAll('.model-select option')).map(o => o.text)
    };
  })()`);

  console.log('RENDER_ERRORS', JSON.stringify(errors));
  console.log('BEFORE', JSON.stringify(before, null, 2));
  console.log('AFTER', JSON.stringify(after, null, 2));
  app.exit(0);
});
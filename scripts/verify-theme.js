// Verify the monochrome theme is applied and the app renders without errors.
// Run with: npx electron scripts/verify-theme.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  // Register the real IPC services against the compiled build.
  require('../dist/main/fsService.js').registerFsHandlers();
  require('../dist/main/ollamaService.js').registerOllamaHandlers(() => win);
  require('../dist/main/ollamaLauncher.js').registerOllamaLauncherHandlers();
  require('../dist/main/settingsService.js').registerSettingsHandlers();
  require('../dist/main/sessionsService.js').registerSessionsHandlers();
  require('../dist/main/terminalService.js').registerTerminalHandlers();

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../dist/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
  await new Promise((r) => setTimeout(r, 2500));

  const report = await win.webContents.executeJavaScript(`(() => {
    const cs = (el) => getComputedStyle(el);
    const parseAlpha = (color) => {
      const m = color.match(/rgba?\\([\\d.,\\s.]+,\\s*([\\d.]+)\\)/);
      return m ? Number(m[1]) : null;
    };
    const blurred = [];
    const transparent = [];
    const samples = {};
    for (const sel of ['.titlebar','.sidebar-pane','.tabbar','.ai-pane','.editor-toolbar','.statusbar','.activity-bar','.input-container','.terminal-panel']) {
      const el = document.querySelector(sel);
      if (!el) { samples[sel] = 'MISSING'; continue; }
      const s = cs(el);
      const backdrop = s.backdropFilter || s.webkitBackdropFilter || '';
      const alpha = parseAlpha(s.backgroundColor);
      samples[sel] = { bg: s.backgroundColor, backdrop: backdrop.slice(0, 34), alpha };
      if (/blur\\(/.test(backdrop)) blurred.push(sel);
      if (alpha !== null && alpha < 1) transparent.push(sel);
    }
    const selF = (el) => {
      let s = el.tagName.toLowerCase();
      if (el.className) s += '.' + String(el.className).split(' ').join('.');
      return s;
    };
    const found = [];
    for (const el of document.querySelectorAll('body *')) {
      const s = cs(el);
      for (const p of [s.color, s.backgroundColor, s.borderColor, s.boxShadow]) {
        if (!p) continue;
        const m = p.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (m) {
          const r = +m[1], g = +m[2], b = +m[3];
          if (b > 90 && b - r > 40 && b - g > 40) found.push(selF(el) + ' -> ' + p);
        }
      }
    }
    const bodyBg = cs(document.body).backgroundImage;
    return {
      title: document.title,
      hasBrand: !!document.querySelector('.brandmark'),
      statusDotClass: document.querySelector('.status-dot') ? document.querySelector('.status-dot').className : 'none',
      bodyHasAmbientGradient: bodyBg && bodyBg.indexOf('radial-gradient') !== -1,
      blurredPanels: blurred,
      transparentPanels: transparent,
      blueishColors: [...new Set(found)].slice(0, 40),
      summary: samples
    };
  })()`);

  console.log('RENDER_ERRORS', JSON.stringify(errors));
  console.log('REPORT', JSON.stringify(report, null, 2));
  app.exit(0);
});
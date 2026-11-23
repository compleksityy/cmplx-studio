import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerFsHandlers } from './fsService';
import { registerOllamaHandlers } from './ollamaService';
import { registerSettingsHandlers } from './settingsService';
import { registerSessionsHandlers } from './sessionsService';
import { registerTerminalHandlers, destroyAllTerminals, initServices } from './terminalService';
import { registerOllamaLauncherHandlers, initOllamaLauncher, destroyManagedOllama } from './ollamaLauncher';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

const getWindow = () => mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0a0c',
    title: 'CMPLX Studio',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
};

app.whenReady().then(() => {
  initServices(getWindow);
  initOllamaLauncher(getWindow);
  registerFsHandlers();
  registerOllamaHandlers(getWindow);
  registerOllamaLauncherHandlers();
  registerSettingsHandlers();
  registerSessionsHandlers();
  registerTerminalHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  destroyAllTerminals();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  destroyAllTerminals();
  destroyManagedOllama();
});
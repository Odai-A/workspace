const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const { spawn } = require('child_process');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const DEV_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:5174';
const gotSingleInstanceLock = app.requestSingleInstanceLock();
const DESKTOP_PORT = Number(process.env.DESKTOP_PORT || 5178);
const appDataRoot = path.join(app.getPath('appData'), 'InventorySystemDesktop');
const HOSTED_BACKEND_FALLBACK = 'https://inventory-backend-6bb3.onrender.com';

let localServer = null;
let appBaseUrl = DEV_URL;
const useDevServer = !app.isPackaged && process.argv.includes('--dev-server');
let backendProcess = null;

if (!gotSingleInstanceLock) {
  app.exit(0);
}

app.setPath('userData', appDataRoot);
app.setPath('sessionData', path.join(appDataRoot, 'session'));

function normalizeBackendTarget(rawUrl) {
  const fallback = HOSTED_BACKEND_FALLBACK;
  const candidate = (rawUrl || fallback).trim();

  try {
    const parsed = new URL(candidate);
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (cleanPath === '/api') {
      parsed.pathname = '';
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function getBackendTarget() {
  const explicitTarget =
    process.env.DESKTOP_BACKEND_URL ||
    process.env.VITE_BACKEND_URL ||
    process.env.VITE_API_URL;

  if (explicitTarget) {
    return normalizeBackendTarget(explicitTarget);
  }

  // Keep localhost backend as default whenever no explicit target is configured.
  return normalizeBackendTarget('http://127.0.0.1:5000');
}

function isLocalBackendTarget(target) {
  try {
    const parsed = new URL(target);
    const localHosts = new Set(['127.0.0.1', 'localhost']);
    return localHosts.has(parsed.hostname) && Number(parsed.port || 80) === 5000;
  } catch {
    return false;
  }
}

function waitForPort(host, port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
    socket.connect(port, host);
  });
}

function resolveBackendCommand() {
  const userProfile = process.env.USERPROFILE || '';
  const projectRoot = path.resolve(__dirname, '..', '..');
  const appPyCandidates = [
    path.join(projectRoot, 'app.py'),
    path.join(userProfile, 'workspace', 'app.py'),
  ];
  const appPyPath = appPyCandidates.find((candidate) => fs.existsSync(candidate));
  if (!appPyPath) return null;

  const venvBesideApp = path.join(path.dirname(appPyPath), '.venv', 'Scripts');
  const venvWorkspace = path.join(userProfile, 'workspace', '.venv', 'Scripts');
  // On Windows, python.exe is a console app and can open a Terminal tab even when hidden;
  // pythonw.exe has no console and is the right default for a background server.
  const pythonCandidates =
    process.platform === 'win32'
      ? [
          path.join(venvBesideApp, 'pythonw.exe'),
          path.join(venvWorkspace, 'pythonw.exe'),
          path.join(venvBesideApp, 'python.exe'),
          path.join(venvWorkspace, 'python.exe'),
        ]
      : [path.join(venvBesideApp, 'python'), path.join(venvWorkspace, 'python')];
  const pythonPath = pythonCandidates.find((candidate) => fs.existsSync(candidate)) || 'python';

  return {
    pythonPath,
    appPyPath,
    cwd: path.dirname(appPyPath),
  };
}

async function ensureLocalBackendRunning(targetUrl) {
  if (!isLocalBackendTarget(targetUrl)) return false;

  const alreadyUp = await waitForPort('127.0.0.1', 5000, 1000);
  if (alreadyUp) return true;

  const command = resolveBackendCommand();
  if (!command) {
    console.warn('Local backend is offline and app.py was not found for auto-start.');
    return false;
  }

  try {
    const spawnOpts = {
      cwd: command.cwd,
      stdio: 'ignore',
      env: {
        ...process.env,
        // Flask debug=True enables Werkzeug's reloader → extra Python process + often a visible Terminal window.
        FLASK_DEBUG: 'false',
        INVENTORY_DESKTOP_BACKEND: '1',
      },
    };
    if (process.platform === 'win32') {
      spawnOpts.windowsHide = true;
      // detached + python.exe on Win11 often opens a visible Windows Terminal tab; keep attached.
      spawnOpts.detached = false;
    } else {
      spawnOpts.detached = true;
    }
    backendProcess = spawn(command.pythonPath, [command.appPyPath], spawnOpts);
    backendProcess.unref();
  } catch (error) {
    console.warn('Failed to auto-start local backend:', error.message);
    return false;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const isUp = await waitForPort('127.0.0.1', 5000, 1000);
    if (isUp) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.warn('Auto-start attempted, but local backend still unavailable on port 5000.');
  return false;
}

async function resolveBackendTarget() {
  const configuredTarget = getBackendTarget();

  if (isLocalBackendTarget(configuredTarget)) {
    const localReady = await ensureLocalBackendRunning(configuredTarget);
    if (localReady) {
      return configuredTarget;
    }

    // Fall back to hosted backend only when local backend cannot be reached.
    return normalizeBackendTarget(HOSTED_BACKEND_FALLBACK);
  }

  return configuredTarget;
}

async function startLocalEdgeServer() {
  if (localServer) return appBaseUrl;

  const distDir = path.join(__dirname, '..', 'dist');
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing production build at ${indexPath}. Run npm run build first.`);
  }

  const backendTarget = await resolveBackendTarget();
  const localApp = express();
  const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });
  const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64 });

  localApp.disable('x-powered-by');

  localApp.get('/health', (_req, res) => {
    res.json({
      ok: true,
      mode: 'desktop-edge',
      backendTarget,
    });
  });

  // Express strips the mount path before the proxy sees req.url (e.g. /api/scan → /scan).
  // Flask expects /api/scan, so rewrite back to /api… or upstream returns HTML 404.
  localApp.use(
    '/api',
    createProxyMiddleware({
      target: backendTarget,
      changeOrigin: true,
      secure: false,
      xfwd: true,
      timeout: 60000,
      proxyTimeout: 60000,
      agent: backendTarget.startsWith('https') ? httpsAgent : httpAgent,
      pathRewrite: (path) => (path.startsWith('/api') ? path : `/api${path}`),
    })
  );

  localApp.use(express.static(distDir, { index: false }));

  localApp.get('*', (_req, res) => {
    res.sendFile(indexPath);
  });

  await new Promise((resolve, reject) => {
    localServer = localApp.listen(DESKTOP_PORT, '127.0.0.1', () => resolve());
    localServer.on('error', reject);
  });

  appBaseUrl = `http://127.0.0.1:${DESKTOP_PORT}`;
  return appBaseUrl;
}

function initAutoUpdater() {
  if (!app.isPackaged) return;

  const flag = String(process.env.DESKTOP_UPDATES || '').toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    console.warn('[auto-update] electron-updater unavailable:', e.message);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const override = (process.env.DESKTOP_UPDATE_FEED_URL || '').trim();
  if (override) {
    const base = override.replace(/\/+$/, '');
    autoUpdater.setFeedURL({ provider: 'generic', url: base });
  }

  autoUpdater.on('error', (err) => {
    console.warn('[auto-update]', err?.message || err);
  });

  const check = () => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('[auto-update] check failed:', err?.message || err);
    });
  };

  setTimeout(check, 12_000);
  setInterval(check, 6 * 60 * 60 * 1000);
}

function resolveWindowIcon() {
  const candidates = [
    path.join(__dirname, 'app-icon.ico'),
    path.join(__dirname, 'app-icon.png'),
    path.join(__dirname, '..', 'public', 'assets', 'images', 'logo.png'),
    path.join(__dirname, '..', 'dist', 'assets', 'images', 'logo.png'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || undefined;
}

async function createWindow() {
  const icon = resolveWindowIcon();
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (useDevServer) {
    await mainWindow.loadURL(DEV_URL);
    return;
  }

  const productionUrl = await startLocalEdgeServer();
  await mainWindow.loadURL(productionUrl);
}

if (gotSingleInstanceLock) {
app.whenReady().then(() => {
  app.on('second-instance', () => {
    const [existingWindow] = BrowserWindow.getAllWindows();
    if (!existingWindow) return;
    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.focus();
  });

  createWindow().catch((error) => {
    console.error('Failed to create desktop window:', error);
    app.quit();
  });

  initAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
}

app.on('window-all-closed', () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

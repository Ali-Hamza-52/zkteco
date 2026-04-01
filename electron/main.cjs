const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");

const isDev = !app.isPackaged;
const PORT = process.env.PORT || "3000";

let mainWindow = null;
let serverStarted = false;

function waitForHttpOk(url, { timeoutMs = 20000 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for server: ${url}`));
          return;
        }
        setTimeout(tick, 300);
      });
      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for server: ${url}`));
          return;
        }
        setTimeout(tick, 300);
      });
    };
    tick();
  });
}

async function startNextServer() {
  if (isDev) return;
  if (serverStarted) return;

  const resourcesPath = process.resourcesPath;
  const standaloneDir = path.join(resourcesPath, "standalone");
  const serverJs = path.join(standaloneDir, "server.js");

  // In packaged Electron, `process.execPath` is Electron itself (not a separate node binary).
  // Next's standalone `server.js` is a Node script, so we start it in-process.
  process.env.NODE_ENV = "production";
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  process.env.PORT = String(PORT);
  process.chdir(standaloneDir);
  // eslint-disable-next-line import/no-dynamic-require, global-require
  require(serverJs);
  serverStarted = true;
}

async function stopNextServer() {
  // No-op: server is started in-process.
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  const url = isDev
    ? `http://localhost:${PORT}`
    : `http://127.0.0.1:${PORT}`;

  mainWindow.loadURL(url);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startNextServer();
  if (!isDev) {
    await waitForHttpOk(`http://127.0.0.1:${PORT}`, { timeoutMs: 25000 });
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", async () => {
  await stopNextServer();
});

app.on("window-all-closed", async () => {
  await stopNextServer();
  if (process.platform !== "darwin") app.quit();
});


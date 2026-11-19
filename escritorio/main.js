// ORI - ORION NOVA TECHNOLOGIES · Proceso principal de Electron
const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const rutaConfig = () => path.join(app.getPath('userData'), 'config.json');
const CONFIG_INICIAL = { servidor: 'http://127.0.0.1:8765', clave: '', voz: true };

function leerConfig() {
  try { return { ...CONFIG_INICIAL, ...JSON.parse(fs.readFileSync(rutaConfig(), 'utf8')) }; }
  catch { return { ...CONFIG_INICIAL }; }
}

function crearVentana() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#050816', title: 'ORI - Orion Nova Technologies', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Los enlaces externos se abren en el navegador, no dentro de la app
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  // Solo se concede el micrófono; cualquier otro permiso se rechaza
  session.defaultSession.setPermissionRequestHandler((_wc, permiso, cb) => cb(permiso === 'media'));

  ipcMain.handle('config:leer', () => leerConfig());
  ipcMain.handle('config:guardar', (_e, datos) => {
    const cfg = { ...leerConfig(), ...datos };
    fs.writeFileSync(rutaConfig(), JSON.stringify(cfg, null, 2));
    return cfg;
  });
  ipcMain.handle('avatar:vrm', () => {
    const p = path.join(__dirname, 'avatar', 'nova.vrm');
    return fs.existsSync(p) ? '../avatar/nova.vrm' : null;
  });
  ipcMain.handle('reporte:guardar', async (_e, { titulo, contenido }) => {
    const nombre = (titulo || 'reporte').replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]/g, '').trim().slice(0, 60) || 'reporte';
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Guardar reporte',
      defaultPath: path.join(app.getPath('documents'), `${nombre}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'Texto', extensions: ['txt'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, contenido, 'utf8');
    return filePath;
  });

  crearVentana();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) crearVentana(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

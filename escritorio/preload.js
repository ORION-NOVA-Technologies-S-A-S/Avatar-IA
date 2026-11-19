const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orion', {
  leerConfig: () => ipcRenderer.invoke('config:leer'),
  guardarConfig: (datos) => ipcRenderer.invoke('config:guardar', datos),
  rutaVRM: () => ipcRenderer.invoke('avatar:vrm'),
  guardarReporte: (titulo, contenido) => ipcRenderer.invoke('reporte:guardar', { titulo, contenido }),
});

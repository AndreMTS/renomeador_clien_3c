const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sisloc', {
  listInstallations: () => ipcRenderer.invoke('installations:list'),
  renameInstallation: (request) => ipcRenderer.invoke('installations:rename', request),
  deleteInstallation: (request) => ipcRenderer.invoke('installations:delete', request)
});
const { contextBridge, ipcRenderer } = require('electron');

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function filterInstallations(installations, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return installations;

  return installations.filter((installation) => {
    const searchableText = normalizeSearchText([
      installation.name,
      installation.suggestedName,
      installation.locationLabel
    ].filter(Boolean).join(' '));
    return searchableText.includes(normalizedQuery);
  });
}

contextBridge.exposeInMainWorld('sisloc', {
  listInstallations: () => ipcRenderer.invoke('installations:list'),
  filterInstallations,
  openDownloadFolder: () => ipcRenderer.invoke('downloads:open-folder'),
  openDownloadPortal: (url) => ipcRenderer.invoke('downloads:open-portal', { url }),
  cancelPortalDownload: () => ipcRenderer.send('downloads:portal-cancel'),
  onPortalDownloadProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('downloads:portal-progress', listener);
    return () => ipcRenderer.removeListener('downloads:portal-progress', listener);
  },
  onPortalDownloadStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('downloads:portal-status', listener);
    return () => ipcRenderer.removeListener('downloads:portal-status', listener);
  },
  openInstallationFolder: (request) => ipcRenderer.invoke('installations:open-folder', request),
  renameInstallation: (request) => ipcRenderer.invoke('installations:rename', request),
  deleteInstallation: (request) => ipcRenderer.invoke('installations:delete', request)
});
const { app, BrowserWindow, ipcMain, Menu, shell, session } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const shortcuts = require('windows-shortcuts');
const {
  hasSislocExecutable,
  validateFolderName
} = require('./src/installation');
const { discoverInstallations, validateDeleteSelection } = require('./src/discovery');
const {
  formatPortalLoadError,
  getDownloadFilename,
  parseDownloadUrl,
  reserveDownloadPathSync
} = require('./src/download');

const portalWindows = new Map();
const portalDownloadItems = new Map();

function downloadDirectory() {
  return path.join(app.getPath('downloads'), 'Gerenciador Sisloc');
}

function sendDownloadEvent(sender, channel, payload) {
  if (!sender.isDestroyed()) sender.send(channel, payload);
}

function guardPortalNavigation(webContents, portalSession, appSender) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (url !== 'about:blank') {
      try {
        parseDownloadUrl(url);
      } catch {
        sendDownloadEvent(appSender, 'downloads:portal-status', {
          type: 'error',
          message: 'Uma janela com protocolo não permitido foi bloqueada.'
        });
        return { action: 'deny' };
      }
    }

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1000,
        height: 720,
        webPreferences: {
          session: portalSession,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: !app.isPackaged
        }
      }
    };
  });

  webContents.on('did-create-window', (childWindow) => {
    guardPortalNavigation(childWindow.webContents, portalSession, appSender);
    childWindow.on('closed', () => {
      sendDownloadEvent(appSender, 'downloads:portal-status', {
        type: 'window-closed',
        message: 'Janela secundária do portal fechada.'
      });
    });
  });

  webContents.on('will-navigate', (navigationEvent, targetUrl) => {
    try {
      const target = parseDownloadUrl(targetUrl);
      const current = new URL(webContents.getURL());
      if (current.protocol === 'https:' && target.protocol === 'http:') {
        navigationEvent.preventDefault();
        sendDownloadEvent(appSender, 'downloads:portal-status', {
          type: 'error',
          message: 'Redirecionamento de HTTPS para HTTP bloqueado.'
        });
      }
    } catch {
      navigationEvent.preventDefault();
      sendDownloadEvent(appSender, 'downloads:portal-status', {
        type: 'error',
        message: 'O portal tentou abrir um endereço fora de HTTP/HTTPS; navegação bloqueada.'
      });
    }
  });

  webContents.on('will-redirect', (navigationEvent, targetUrl, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    try {
      const source = parseDownloadUrl(webContents.getURL());
      const target = parseDownloadUrl(targetUrl);
      if (source.protocol === 'https:' && target.protocol === 'http:') {
        navigationEvent.preventDefault();
        sendDownloadEvent(appSender, 'downloads:portal-status', {
          type: 'error',
          message: 'Redirecionamento de HTTPS para HTTP bloqueado.'
        });
      }
    } catch {
      navigationEvent.preventDefault();
      sendDownloadEvent(appSender, 'downloads:portal-status', {
        type: 'error',
        message: 'Redirecionamento para um protocolo não permitido foi bloqueado.'
      });
    }
  });
}

function installationRoots() {
  return {
    documentsRoot: path.join(app.getPath('documents'), 'Sisloc'),
    appDataRoot: path.join(path.dirname(app.getPath('appData')), 'Local', 'Sisloc')
  };
}

async function readInstallations() {
  const roots = installationRoots();
  const discovered = await discoverInstallations(roots);
  return {
    locations: roots,
    installations: discovered.map(({ folderPath, parentPath, ...installation }) => installation)
  };
}

function createShortcut(shortcutPath, targetPath, targetName) {
  return new Promise((resolve, reject) => {
    shortcuts.create(shortcutPath, {
      target: targetPath,
      workingDir: path.dirname(targetPath),
      args: '/client',
      runStyle: shortcuts.MIN,
      desc: `Atalho cliente ${targetName}`
    }, (error) => error ? reject(error) : resolve());
  });
}

ipcMain.handle('installations:list', readInstallations);

ipcMain.handle('downloads:open-folder', async () => {
  const directory = downloadDirectory();
  await fs.mkdir(directory, { recursive: true });
  const error = await shell.openPath(directory);
  return error
    ? { ok: false, message: `Não foi possível abrir a pasta: ${error}` }
    : { ok: true, message: `Pasta de downloads aberta: ${directory}` };
});

ipcMain.handle('downloads:open-portal', async (event, request) => {
  let url;
  try {
    url = parseDownloadUrl(request?.url);
  } catch (error) {
    return { ok: false, message: error.message };
  }

  const senderId = event.sender.id;
  if (portalDownloadItems.has(senderId)) {
    return { ok: false, message: 'Aguarde o download atual terminar ou cancele-o antes de abrir outro link.' };
  }
  const existingWindow = portalWindows.get(senderId);
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.focus();
    existingWindow.loadURL(url.href).catch((error) => {
      if (error.code !== 'ERR_ABORTED' && !existingWindow.isDestroyed() && !portalDownloadItems.has(senderId)) {
        sendDownloadEvent(event.sender, 'downloads:portal-status', {
          type: 'error',
          message: formatPortalLoadError(error)
        });
      }
    });
    return { ok: true, message: 'Endereço aberto. Se for um arquivo, o download começará automaticamente.' };
  }

  const portalSession = session.fromPartition(`sisloc-download-${senderId}-${Date.now()}`);
  const portalWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 720,
    minHeight: 560,
    parent: BrowserWindow.fromWebContents(event.sender) || undefined,
    title: 'Portal de instalação do cliente',
    webPreferences: {
      session: portalSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });

  portalWindows.set(senderId, portalWindow);
  guardPortalNavigation(portalWindow.webContents, portalSession, event.sender);
  portalSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  portalSession.on('will-download', (downloadEvent, item, webContents) => {
    try {
      if (portalDownloadItems.has(senderId)) {
        downloadEvent.preventDefault();
        sendDownloadEvent(event.sender, 'downloads:portal-status', {
          type: 'error',
          message: 'Já existe um download em andamento. Cancele-o ou aguarde o término.'
        });
        return;
      }
      const sourceUrl = parseDownloadUrl(item.getURL());
      const filename = getDownloadFilename(sourceUrl, item.getFilename());
      const savePath = reserveDownloadPathSync(downloadDirectory(), filename);
      item.setSavePath(savePath);
      portalDownloadItems.set(senderId, item);
      sendDownloadEvent(event.sender, 'downloads:portal-status', {
        type: 'started',
        filename,
        filePath: savePath
      });

      item.on('updated', (_downloadEvent, state) => {
        if (state === 'progressing') {
          const totalBytes = item.getTotalBytes();
          const receivedBytes = item.getReceivedBytes();
          sendDownloadEvent(event.sender, 'downloads:portal-progress', {
            filename,
            receivedBytes,
            totalBytes,
            percent: totalBytes > 0 ? Math.min(100, Math.floor(receivedBytes / totalBytes * 100)) : null
          });
        }
      });

      item.once('done', (_doneEvent, state) => {
        if (portalDownloadItems.get(senderId) === item) portalDownloadItems.delete(senderId);
        if (state === 'completed') {
          sendDownloadEvent(event.sender, 'downloads:portal-status', {
            type: 'completed',
            filename,
            filePath: savePath
          });
        } else {
          fs.rm(savePath, { force: true }).catch(() => {});
          sendDownloadEvent(event.sender, 'downloads:portal-status', {
            type: state === 'cancelled' ? 'cancelled' : 'error',
            message: state === 'cancelled' ? 'Download do portal cancelado.' : `Download do portal terminou: ${state}.`
          });
        }
      });
    } catch (error) {
      downloadEvent.preventDefault();
      sendDownloadEvent(event.sender, 'downloads:portal-status', {
        type: 'error',
        message: error.message
      });
    }
  });

  portalWindow.on('closed', () => {
    if (portalWindows.get(senderId) === portalWindow) portalWindows.delete(senderId);
    const activeItem = portalDownloadItems.get(senderId);
    if (activeItem) activeItem.cancel();
    else {
      sendDownloadEvent(event.sender, 'downloads:portal-status', {
        type: 'window-closed',
        message: 'Janela do portal fechada.'
      });
    }
  });

  portalWindow.show();
  portalWindow.loadURL(url.href).catch((error) => {
    if (error.code !== 'ERR_ABORTED' && !portalWindow.isDestroyed() && !portalDownloadItems.has(senderId)) {
      sendDownloadEvent(event.sender, 'downloads:portal-status', {
        type: 'error',
        message: formatPortalLoadError(error)
      });
    }
  });
  return { ok: true, message: 'Endereço aberto. Se for um arquivo, o download começará automaticamente.' };
});

ipcMain.on('downloads:portal-cancel', (event) => {
  portalDownloadItems.get(event.sender.id)?.cancel();
});

ipcMain.handle('installations:open-folder', async (_event, request) => {
  const installationId = typeof request?.installationId === 'string' ? request.installationId : '';
  const installations = await discoverInstallations(installationRoots());
  const selectedInstallation = installations.find((installation) => installation.id === installationId);
  if (!selectedInstallation) {
    return { ok: false, message: 'A instalação selecionada não é mais encontrada.' };
  }

  const error = await shell.openPath(selectedInstallation.folderPath);
  return error
    ? { ok: false, message: `Não foi possível abrir a pasta: ${error}` }
    : { ok: true, message: `Pasta aberta: ${selectedInstallation.locationLabel}` };
});

ipcMain.handle('installations:rename', async (_event, request) => {
  const installationId = typeof request?.installationId === 'string' ? request.installationId : '';
  const targetName = typeof request?.targetName === 'string' ? request.targetName.trim() : '';
  const nameError = validateFolderName(targetName);
  if (nameError) return { ok: false, message: nameError };

  const discovered = await discoverInstallations(installationRoots());
  const selectedInstallation = discovered.find((installation) => installation.id === installationId);
  if (!selectedInstallation) {
    return { ok: false, message: 'A instalação selecionada não é válida.' };
  }

  const { name: sourceName, folderPath: sourcePath, parentPath } = selectedInstallation;
  const sameFolder = sourceName.toLowerCase() === targetName.toLowerCase();
  const targetPath = path.join(parentPath, targetName);
  const shouldCreateShortcut = !selectedInstallation.isManaged;
  const shortcutPath = path.join(app.getPath('desktop'), `${targetName}.lnk`);
  let renamed = false;

  try {
    const sourceContents = await fs.readdir(sourcePath, { withFileTypes: true });
    if (!hasSislocExecutable(sourceContents)) {
      return { ok: false, message: 'A pasta selecionada não contém o arquivo sisloc.exe.' };
    }

    if (!sameFolder) {
      try {
        await fs.access(targetPath);
        return { ok: false, message: `Já existe uma pasta chamada "${targetName}". Escolha outro nome. Nada foi substituído.` };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }

    if (shouldCreateShortcut) {
      try {
        await fs.access(shortcutPath);
        return { ok: false, message: `Já existe um atalho chamado "${targetName}.lnk" na Área de Trabalho. Escolha outro nome. Nada foi alterado.` };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }

    if (!sameFolder) {
      await fs.rename(sourcePath, targetPath);
      renamed = true;
    }

    if (shouldCreateShortcut) {
      await createShortcut(
        shortcutPath,
        path.join(targetPath, 'sisloc.exe'),
        targetName
      );
    }

    const message = shouldCreateShortcut
      ? `Atalho criado para ${targetName}.`
      : `Pasta renomeada para ${targetName}. Atalhos preexistentes não foram alterados.`;
    return { ok: true, message, renamed };
  } catch (error) {
    const message = renamed
      ? `A pasta foi renomeada, mas o atalho não pôde ser criado: ${error.message}`
      : `Não foi possível concluir a operação: ${error.message}`;
    return { ok: false, message, renamed };
  }
});

ipcMain.handle('installations:delete', async (_event, request) => {
  const installationId = typeof request?.installationId === 'string' ? request.installationId : '';
  const confirmationName = typeof request?.confirmationName === 'string' ? request.confirmationName : '';
  const roots = installationRoots();
  const discovered = await discoverInstallations(roots);
  const selectedInstallation = discovered.find((installation) => installation.id === installationId);

  const allowedParents = [roots.documentsRoot, roots.appDataRoot, path.join(roots.appDataRoot, 'sisloc')];
  const validationError = validateDeleteSelection(selectedInstallation, confirmationName, allowedParents);
  if (validationError) return { ok: false, message: validationError };

  try {
    await fs.rm(selectedInstallation.folderPath, { recursive: true, force: false });
    return { ok: true, message: `A pasta "${selectedInstallation.name}" foi apagada.` };
  } catch (error) {
    return { ok: false, message: `Não foi possível apagar a pasta: ${error.message}` };
  }
});

function createWindow() {
  const window = new BrowserWindow({
    width: 982,
    height: 701,
    minWidth: 720,
    minHeight: 620,
    backgroundColor: '#f4f6f2',
    title: 'Andre Matos - Gerenciador 3C',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });

  window.loadFile('index.html');
}

app.whenReady().then(() => {
  if (app.isPackaged) Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
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
  addDetectedDownloadExtension,
  formatPortalLoadError,
  getDownloadFilename,
  parseDownloadUrl,
  prepareInstallerUrl,
  reserveDownloadPathSync
} = require('./src/download');

const portalDownloadItems = new Map();

function downloadDirectory() {
  return path.join(app.getPath('downloads'), 'Gerenciador Sisloc');
}

function sendDownloadEvent(sender, channel, payload) {
  if (!sender.isDestroyed()) sender.send(channel, payload);
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
  let installerUrl;
  try {
    installerUrl = prepareInstallerUrl(request?.url);
  } catch (error) {
    return { ok: false, message: error.message };
  }

  const senderId = event.sender.id;
  if (portalDownloadItems.has(senderId)) {
    return { ok: false, message: 'Aguarde o download atual terminar ou cancele-o antes de iniciar outro.' };
  }

  const portalSession = session.fromPartition(`sisloc-download-${senderId}-${Date.now()}`);
  portalSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  portalSession.on('will-download', (downloadEvent, item, _webContents) => {
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
          let finalPath = savePath;
          try {
            finalPath = addDetectedDownloadExtension(savePath, item.getMimeType());
          } catch {}
          const finalFilename = path.basename(finalPath);
          sendDownloadEvent(event.sender, 'downloads:portal-status', {
            type: 'completed',
            filename: finalFilename,
            filePath: finalPath
          });
        } else {
          fs.rm(savePath, { force: true }).catch(() => {});
          sendDownloadEvent(event.sender, 'downloads:portal-status', {
            type: state === 'cancelled' ? 'cancelled' : 'error',
            message: state === 'cancelled' ? 'Download cancelado.' : `Download terminou: ${state}.`
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

  try {
    portalSession.downloadURL(installerUrl.href);
  } catch (error) {
    return { ok: false, message: `Não foi possível iniciar o download: ${error.message}` };
  }

  return { ok: true, message: 'Download iniciado automaticamente.' };
});

ipcMain.on('downloads:portal-cancel', (event) => {
  portalDownloadItems.get(event.sender.id)?.cancel();
});

ipcMain.handle('downloads:execute', async (_event, request) => {
  const filePath = typeof request?.filePath === 'string' ? request.filePath : '';
  if (!filePath) {
    return { ok: false, message: 'Caminho do arquivo inválido.' };
  }
  try {
    await fs.access(filePath);
  } catch {
    return { ok: false, message: 'O arquivo baixado não foi encontrado no disco.' };
  }

  const error = await shell.openPath(filePath);
  return error
    ? { ok: false, message: `Não foi possível executar o arquivo: ${error}` }
    : { ok: true, message: `Executando: ${path.basename(filePath)}` };
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
        await fs.rm(shortcutPath, { force: true });
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
    let detail = error.message;
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      detail = 'A pasta ou o arquivo (sisloc.exe) está em uso ou aberto. Feche o programa antes de renomear.';
    }
    const message = renamed
      ? `A pasta foi renomeada, mas o atalho não pôde ser criado: ${detail}`
      : `Não foi possível concluir a operação: ${detail}`;
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
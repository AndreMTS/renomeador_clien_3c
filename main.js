const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const shortcuts = require('windows-shortcuts');
const {
  hasSislocExecutable,
  validateFolderName
} = require('./src/installation');
const { discoverInstallations, validateDeleteSelection } = require('./src/discovery');

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
    width: 940,
    height: 570,
    minWidth: 720,
    minHeight: 520,
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
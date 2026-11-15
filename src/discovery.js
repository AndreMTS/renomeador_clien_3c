const fs = require('fs/promises');
const path = require('path');
const { extractCompanyNameFromIni, hasSislocExecutable } = require('./installation');

async function discoverInstallations({ documentsRoot, appDataRoot, fileSystem = fs }) {
  const installations = [];

  async function addCandidate({ id, name, folderPath, parentPath, locationLabel }) {
    let entries;
    try {
      entries = await fileSystem.readdir(folderPath, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
      throw error;
    }

    if (!hasSislocExecutable(entries)) return;

    let suggestedName = null;
    try {
      const ini = await fileSystem.readFile(path.join(folderPath, 'PSISLOC.ini'), 'utf8');
      suggestedName = extractCompanyNameFromIni(ini);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    installations.push({
      id,
      name,
      folderPath,
      parentPath,
      locationLabel,
      isClient: name.toLowerCase() === 'client',
      isManaged: !['client', 'sisloc'].includes(name.toLowerCase()),
      suggestedName
    });
  }

  async function addChildFolders(root, rootId, locationLabel) {
    let folders;
    try {
      folders = await fileSystem.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
      throw error;
    }

    for (const folder of folders) {
      if (!folder.isDirectory()) continue;
      await addCandidate({
        id: `${rootId}:${folder.name}`,
        name: folder.name,
        folderPath: path.join(root, folder.name),
        parentPath: root,
        locationLabel: `${locationLabel}\\${folder.name}`
      });
    }
  }

  await addChildFolders(documentsRoot, 'documents', 'Documentos\\Sisloc');

  await addChildFolders(appDataRoot, 'appdata', 'AppData\\Local\\Sisloc');
  await addChildFolders(
    path.join(appDataRoot, 'sisloc'),
    'appdata:sisloc',
    'AppData\\Local\\Sisloc\\sisloc'
  );

  installations.sort((left, right) => {
    if (left.isClient !== right.isClient) return left.isClient ? -1 : 1;
    const locationOrder = left.locationLabel.localeCompare(right.locationLabel, 'pt-BR', { sensitivity: 'base' });
    return locationOrder || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });
  });

  return installations;
}

function validateDeleteSelection(installation, confirmationName, allowedParents) {
  if (!installation || !installation.isManaged) {
    return 'A instalação selecionada não é válida para exclusão.';
  }
  if (confirmationName !== installation.name) {
    return 'O nome digitado não corresponde à pasta. Nada foi apagado.';
  }
  if (!allowedParents.some((parent) => path.resolve(parent) === path.resolve(installation.parentPath))) {
    return 'O local da instalação não está entre as pastas monitoradas.';
  }
  return null;
}

module.exports = { discoverInstallations, validateDeleteSelection };
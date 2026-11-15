const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { discoverInstallations, validateDeleteSelection } = require('../src/discovery');

test('discovers exact Sisloc executables in Documents and both AppData layouts', async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'multi-client-discovery-'));
  context.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));

  const documentsRoot = path.join(temporaryRoot, 'Documents', 'Sisloc');
  const appDataRoot = path.join(temporaryRoot, 'AppData', 'Local', 'Sisloc');
  const appDataInstallRoot = path.join(appDataRoot, 'sisloc');
  const documentClient = path.join(documentsRoot, 'Client');
  const falseMatch = path.join(documentsRoot, 'Other Sisloc Tools');
  const appDataNestedInstall = path.join(appDataInstallRoot, 'FilialNova');

  await fs.mkdir(documentClient, { recursive: true });
  await fs.mkdir(falseMatch, { recursive: true });
  await fs.mkdir(appDataInstallRoot, { recursive: true });
  await fs.mkdir(appDataNestedInstall, { recursive: true });
  await fs.writeFile(path.join(documentClient, 'sisloc.exe'), 'test');
  await fs.writeFile(path.join(falseMatch, 'mysisloc.exe'), 'test');
  await fs.writeFile(path.join(appDataInstallRoot, 'SISLOC.EXE'), 'test');
  await fs.writeFile(path.join(appDataNestedInstall, 'sisloc.exe'), 'test');
  await fs.writeFile(path.join(appDataInstallRoot, 'PSISLOC.ini'), 'url=https://host/sisloc/AppDataEmpresa');

  const installations = await discoverInstallations({ documentsRoot, appDataRoot });

  assert.deepEqual(installations.map(({ id }) => id).sort(), [
    'appdata:sisloc',
    'appdata:sisloc:FilialNova',
    'documents:Client'
  ]);
  assert.equal(installations.find(({ id }) => id === 'appdata:sisloc').suggestedName, 'AppDataEmpresa');
  assert.equal(installations.find(({ id }) => id === 'appdata:sisloc').parentPath, appDataRoot);
  assert.equal(installations.find(({ id }) => id === 'appdata:sisloc').isManaged, false);
  assert.equal(installations.find(({ id }) => id === 'appdata:sisloc:FilialNova').isManaged, true);
});

test('allows deletion only for managed installs with exact name and approved parent', () => {
  const allowedParent = path.resolve('C:/Users/test/Documents/Sisloc');
  const installation = {
    name: 'Cliente Alfa',
    parentPath: allowedParent,
    isManaged: true
  };

  assert.equal(validateDeleteSelection(installation, 'Cliente Alfa', [allowedParent]), null);
  assert.match(validateDeleteSelection(installation, 'cliente alfa', [allowedParent]), /nome digitado não corresponde/);
  assert.match(validateDeleteSelection({ ...installation, isManaged: false }, 'Cliente Alfa', [allowedParent]), /não é válida para exclusão/);
  assert.match(validateDeleteSelection({ ...installation, parentPath: 'C:/fora' }, 'Cliente Alfa', [allowedParent]), /pastas monitoradas/);
});
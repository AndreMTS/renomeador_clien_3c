const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  addDetectedDownloadExtension,
  detectDownloadExtension,
  formatPortalLoadError,
  getDownloadFilename,
  parseDownloadUrl,
  prepareInstallerUrl,
  reserveDownloadPathSync,
  sanitizeDownloadFilename
} = require('../src/download');

test('prepares installer URL by appending install?type=sisloc correctly', () => {
  assert.equal(
    prepareInstallerUrl('http://teclift.sisloc.srv.br/teclift/').href,
    'http://teclift.sisloc.srv.br/teclift/install?type=sisloc'
  );
  assert.equal(
    prepareInstallerUrl('http://teclift.sisloc.srv.br/teclift').href,
    'http://teclift.sisloc.srv.br/teclift/install?type=sisloc'
  );
  assert.equal(
    prepareInstallerUrl('https://cliente.example/portal/install').href,
    'https://cliente.example/portal/install?type=sisloc'
  );
  assert.equal(
    prepareInstallerUrl('https://cliente.example/portal/install?type=custom').href,
    'https://cliente.example/portal/install?type=custom'
  );
});

test('accepts HTTP and HTTPS URLs but rejects other schemes and embedded credentials', () => {
  assert.equal(parseDownloadUrl('http://192.168.1.20/client.zip').protocol, 'http:');
  assert.equal(parseDownloadUrl('https://cliente.example/client.zip').protocol, 'https:');
  assert.throws(() => parseDownloadUrl('file:///C:/client.zip'), /HTTP ou HTTPS/);
  assert.throws(() => parseDownloadUrl('https://user:pass@cliente.example/client.zip'), /Remova usuário e senha/);
});

test('explains HTTPS protocol and certificate failures without suggesting an automatic downgrade', () => {
  const protocolError = formatPortalLoadError({ code: 'ERR_SSL_PROTOCOL_ERROR', message: 'handshake failed' });
  assert.match(protocolError, /Confirme com o cliente/);
  assert.match(protocolError, /não troca o protocolo automaticamente/);

  const certificateError = formatPortalLoadError({ code: 'ERR_CERT_AUTHORITY_INVALID' });
  assert.match(certificateError, /certificado HTTPS/);
  assert.match(certificateError, /não ignore/);
});

test('reserves unique safe paths for downloads started by the browser portal', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sisloc-download-reserve-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));

  const firstPath = reserveDownloadPathSync(directory, 'pacote.zip');
  const secondPath = reserveDownloadPathSync(directory, 'pacote.zip');

  assert.equal(path.basename(firstPath), 'pacote.zip');
  assert.equal(path.basename(secondPath), 'pacote (1).zip');
  assert.equal(path.dirname(secondPath), directory);
});

test('detects an executable without an extension and appends .exe without replacing another file', async (context) => {
  assert.equal(detectDownloadExtension('application/octet-stream', Buffer.from('MZ installer')), '.exe');
  assert.equal(detectDownloadExtension('application/octet-stream', Buffer.from('<html>')), '');

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sisloc-download-extension-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'application');
  const existingPath = path.join(directory, 'application.exe');
  await fs.writeFile(sourcePath, Buffer.from('MZ installer'));
  await fs.writeFile(existingPath, 'keep this file');

  const resultPath = addDetectedDownloadExtension(sourcePath, 'application/octet-stream');
  assert.equal(path.basename(resultPath), 'application (1).exe');
  assert.equal(await fs.readFile(existingPath, 'utf8'), 'keep this file');
  assert.deepEqual((await fs.readFile(resultPath)).subarray(0, 2), Buffer.from('MZ'));
});

test('sanitizes filenames received from remote servers', () => {
  assert.equal(sanitizeDownloadFilename('../CON?.zip'), '_CON_.zip');
  assert.equal(
    getDownloadFilename(new URL('https://cliente.example/download'), 'attachment; filename="cliente 3c.zip"'),
    'cliente 3c.zip'
  );
  assert.equal(
    getDownloadFilename(new URL('https://cliente.example/files/pacote.zip')),
    'pacote.zip'
  );
});


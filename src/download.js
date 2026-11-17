const fsSync = require('fs');
const path = require('path');

function parseDownloadUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Informe um endereço HTTP ou HTTPS válido.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Por segurança, só são aceitos endereços HTTP ou HTTPS.');
  }
  if (url.username || url.password) {
    throw new Error('Remova usuário e senha do endereço antes de baixar.');
  }

  return url;
}

function prepareInstallerUrl(value) {
  const url = parseDownloadUrl(value);
  const pathname = url.pathname;
  if (!pathname.endsWith('/install') && !pathname.endsWith('/install/')) {
    if (!pathname.endsWith('/')) {
      url.pathname += '/';
    }
    return new URL('install?type=sisloc', url);
  }

  if (!url.searchParams.has('type')) {
    url.searchParams.set('type', 'sisloc');
  }

  return url;
}

function formatPortalLoadError(error) {
  const details = `${error?.code || ''} ${error?.message || ''}`;
  if (/ERR_SSL_PROTOCOL_ERROR/i.test(details)) {
    return 'Falha ao negociar HTTPS com o servidor. Confirme com o cliente se esse endereço e porta usam HTTP ou HTTPS; o gerenciador não troca o protocolo automaticamente.';
  }
  if (/ERR_CERT_|CERT_AUTHORITY_INVALID|CERT_DATE_INVALID/i.test(details)) {
    return 'O certificado HTTPS do servidor não pôde ser validado. Confirme o endereço e o certificado com o cliente; não ignore o aviso de segurança.';
  }
  return `Não foi possível carregar o endereço: ${error?.message || 'erro de conexão'}`;
}

function getDownloadFilename(url, contentDisposition = '') {
  const encodedName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  let filename = encodedName ? decodeFilename(encodedName[1]) : '';

  if (!filename) {
    const regularName = contentDisposition.match(/filename\s*=\s*(?:"([^"]*)"|([^;]*))/i);
    filename = regularName ? (regularName[1] || regularName[2] || '').trim() : '';
  }

  if (!filename) {
    try {
      filename = decodeURIComponent(path.posix.basename(url.pathname));
    } catch {
      filename = '';
    }
  }

  return sanitizeDownloadFilename(filename);
}

function sanitizeDownloadFilename(value) {
  let filename = String(value || '')
    .replace(/[\\/]/g, '_')
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 160);

  if (!filename || filename === '.' || filename === '..') filename = 'sisloc-download';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)) filename = `_${filename}`;
  return filename;
}

function decodeFilename(value) {
  try {
    return decodeURIComponent(value.trim().replace(/^"|"$/g, ''));
  } catch {
    return '';
  }
}

function reserveDownloadPathSync(directory, filename) {
  fsSync.mkdirSync(directory, { recursive: true });
  const extension = path.extname(filename);
  const base = path.basename(filename, extension);

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : ` (${index})`;
    const filePath = path.join(directory, `${base}${suffix}${extension}`);
    try {
      const fileDescriptor = fsSync.openSync(filePath, 'wx');
      fsSync.closeSync(fileDescriptor);
      return filePath;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  throw new Error('Não foi possível reservar um nome de arquivo disponível.');
}

function detectDownloadExtension(mimeType, header) {
  if (Buffer.isBuffer(header)) {
    if (header.length >= 2 && header[0] === 0x4d && header[1] === 0x5a) return '.exe';
    if (header.length >= 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04) return '.zip';
    if (header.subarray(0, 4).toString('ascii') === 'Rar!') return '.rar';
    if (header.length >= 6 && header.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))) return '.7z';
    if (header.length >= 4 && header.subarray(0, 4).toString('ascii') === '%PDF') return '.pdf';
  }

  const normalizedMimeType = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (['application/x-msdownload', 'application/vnd.microsoft.portable-executable', 'application/x-msdos-program'].includes(normalizedMimeType)) {
    return '.exe';
  }
  if (['application/zip', 'application/x-zip-compressed'].includes(normalizedMimeType)) return '.zip';
  if (normalizedMimeType === 'application/pdf') return '.pdf';
  return '';
}

function addDetectedDownloadExtension(filePath, mimeType) {
  if (path.extname(filePath)) return filePath;

  const fileDescriptor = fsSync.openSync(filePath, 'r');
  const header = Buffer.alloc(8);
  let bytesRead;
  try {
    bytesRead = fsSync.readSync(fileDescriptor, header, 0, header.length, 0);
  } finally {
    fsSync.closeSync(fileDescriptor);
  }

  const extension = detectDownloadExtension(mimeType, header.subarray(0, bytesRead));
  if (!extension) return filePath;

  const directory = path.dirname(filePath);
  const base = path.basename(filePath);
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : ` (${index})`;
    const targetPath = path.join(directory, `${base}${suffix}${extension}`);
    if (fsSync.existsSync(targetPath)) continue;
    try {
      fsSync.renameSync(filePath, targetPath);
      return targetPath;
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
    }
  }

  throw new Error('Não foi possível adicionar a extensão sem sobrescrever outro arquivo.');
}

module.exports = {
  addDetectedDownloadExtension,
  detectDownloadExtension,
  formatPortalLoadError,
  getDownloadFilename,
  parseDownloadUrl,
  prepareInstallerUrl,
  reserveDownloadPathSync,
  sanitizeDownloadFilename
};

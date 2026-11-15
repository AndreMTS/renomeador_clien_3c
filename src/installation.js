const RESERVED_COMPANY_NAMES = new Set(['sisloc', 'client']);
const INVALID_FOLDER_CHARACTERS = /[<>:"/\\|?*\x00-\x1f]/;

function extractCompanyNameFromIni(contents) {
  for (const line of contents.split(/\r?\n/)) {
    const match = line.trim().match(/^url\s*=\s*(.+)$/i);
    if (!match) continue;

    for (const rawUrl of match[1].split(';')) {
      const value = rawUrl.trim();
      if (!value) continue;

      let segments;
      try {
        segments = new URL(value, 'http://sisloc.local').pathname
          .split('/')
          .filter(Boolean);
      } catch {
        continue;
      }

      let candidate;
      try {
        candidate = decodeURIComponent(segments.at(-1) || '').trim();
      } catch {
        continue;
      }
      if (candidate && !RESERVED_COMPANY_NAMES.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  return null;
}

function validateFolderName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) return 'Informe o nome da pasta.';
  if (value.length > 80) return 'O nome da pasta deve ter no máximo 80 caracteres.';
  if (INVALID_FOLDER_CHARACTERS.test(value) || /[. ]$/.test(value)) {
    return 'O nome contém caracteres inválidos para uma pasta do Windows.';
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
    return 'Esse nome é reservado pelo Windows.';
  }
  return null;
}

function hasSislocExecutable(entries) {
  return entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === 'sisloc.exe');
}

module.exports = { extractCompanyNameFromIni, hasSislocExecutable, validateFolderName };
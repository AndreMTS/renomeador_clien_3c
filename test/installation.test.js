const assert = require('node:assert/strict');
const test = require('node:test');
const {
  extractCompanyNameFromIni,
  hasSislocExecutable,
  validateFolderName
} = require('../src/installation');

test('extracts the company name from a URL in PSISLOC.ini', () => {
  assert.equal(
    extractCompanyNameFromIni('[config]\r\nurl=https://servidor/sisloc/MinhaEmpresa/\r\n'),
    'MinhaEmpresa'
  );
});

test('does not mistake the generic sisloc route for a company', () => {
  assert.equal(extractCompanyNameFromIni('url=https://servidor/sisloc/'), null);
  assert.equal(extractCompanyNameFromIni('url=/sisloc?modo=cliente'), null);
  assert.equal(extractCompanyNameFromIni('url=https://servidor/%E0%A4%A'), null);
});

test('uses the first meaningful URL in a semicolon-separated setting', () => {
  assert.equal(
    extractCompanyNameFromIni('url=https://servidor/sisloc/;https://servidor/FilialA'),
    'FilialA'
  );
});

test('rejects unsafe Windows folder names', () => {
  assert.equal(validateFolderName('Empresa: Norte'), 'O nome contém caracteres inválidos para uma pasta do Windows.');
  assert.equal(validateFolderName('../fora'), 'O nome contém caracteres inválidos para uma pasta do Windows.');
  assert.equal(validateFolderName('CON'), 'Esse nome é reservado pelo Windows.');
  assert.equal(validateFolderName('Empresa 3C'), null);
});

test('recognizes an installation only by the exact sisloc.exe filename', () => {
  const file = (name) => ({ name, isFile: () => true });
  const directory = (name) => ({ name, isFile: () => false });

  assert.equal(hasSislocExecutable([file('SISLOC.EXE')]), true);
  assert.equal(hasSislocExecutable([file('minhasisloc.exe')]), false);
  assert.equal(hasSislocExecutable([directory('sisloc.exe')]), false);
});
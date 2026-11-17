const listElement = document.getElementById('installation-list');
const rootElement = document.getElementById('root-path');
const countElement = document.getElementById('installation-count');
const formElement = document.getElementById('rename-form');
const emptySelection = document.getElementById('empty-selection');
const nameInput = document.getElementById('folder-name');
const selectedTitle = document.getElementById('selected-installation');
const selectedLocation = document.getElementById('selected-location');
const suggestionNote = document.getElementById('suggestion-note');
const statusMessage = document.getElementById('status-message');
const statusIndicator = document.getElementById('status-indicator');
const renameButton = document.getElementById('rename-button');
const refreshButton = document.getElementById('refresh-button');
const availableTab = document.getElementById('available-tab');
const managedTab = document.getElementById('managed-tab');
const managedFilterContainer = document.getElementById('managed-filter-container');
const managedFilter = document.getElementById('managed-filter');
const openFolderButton = document.getElementById('open-folder-button');
const deleteButton = document.getElementById('delete-installation-button');
const actionDialog = document.getElementById('action-dialog');
const actionDialogTitle = document.getElementById('action-dialog-title');
const actionDialogMessage = document.getElementById('action-dialog-message');
const actionNameGroup = document.getElementById('action-name-group');
const actionNameInput = document.getElementById('action-name-input');
const actionCancelButton = document.getElementById('action-cancel-button');
const actionConfirmButton = document.getElementById('action-confirm-button');
const renameButtonLabel = renameButton.querySelector('span');
const managerView = document.getElementById('manager-view');
const downloadView = document.getElementById('download-view');
const manageViewTab = document.getElementById('manage-view-tab');
const downloadViewTab = document.getElementById('download-view-tab');
const portalForm = document.getElementById('portal-form');
const portalUrlInput = document.getElementById('portal-url');
const portalHttpWarning = document.getElementById('portal-http-warning');
const openPortalButton = document.getElementById('open-portal-button');
const openDownloadFolderButton = document.getElementById('open-download-folder-button');
const cancelDownloadButton = document.getElementById('cancel-download-button');
const downloadProgress = document.getElementById('download-progress');
const downloadProgressMessage = document.getElementById('download-progress-message');
const downloadProgressPercent = document.getElementById('download-progress-percent');

let installations = [];
let selectedInstallation = null;
let busy = false;
let activeTab = 'managed';
let pendingAction = null;
let downloadBusy = false;

function setStatus(message, kind = 'neutral') {
  statusMessage.textContent = message;
  statusIndicator.className = `status-indicator ${kind}`;
}

function chooseInstallation(installation) {
  selectedInstallation = installation;
  selectedTitle.textContent = installation.name;
  selectedLocation.textContent = installation.locationLabel;
  deleteButton.hidden = !installation.isManaged;
  renameButtonLabel.textContent = installation.isManaged ? 'Renomear pasta' : 'Renomear e criar atalho';
  nameInput.value = installation.suggestedName || '';
  suggestionNote.textContent = installation.suggestedName
    ? 'Sugestão preenchida com os dados do PSISLOC.ini. Você pode editá-la.'
    : 'Não foi possível obter o nome do PSISLOC.ini. Digite o nome manualmente.';
  formElement.hidden = false;
  emptySelection.hidden = true;
  renderInstallations();
  nameInput.focus();
  nameInput.select();
}

function renderInstallations() {
  listElement.replaceChildren();
  const tabInstallations = installations.filter((installation) =>
    activeTab === 'managed' ? installation.isManaged : !installation.isManaged
  );
  const visibleInstallations = activeTab === 'managed'
    ? window.sisloc.filterInstallations(tabInstallations, managedFilter.value)
    : tabInstallations;
  countElement.textContent = String(visibleInstallations.length);

  if (visibleInstallations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    const heading = document.createElement('strong');
    const hasFilter = activeTab === 'managed' && managedFilter.value.trim();
    heading.textContent = hasFilter
      ? 'Nenhuma instalação corresponde ao filtro'
      : activeTab === 'managed'
      ? 'Nenhuma instalação organizada ainda'
      : 'Nenhuma instalação para organizar';
    const detail = document.createElement('span');
    detail.textContent = hasFilter
      ? 'Tente outro nome de cliente ou local.'
      : activeTab === 'managed'
      ? 'As pastas renomeadas aparecerão aqui e poderão ser renomeadas ou apagadas.'
      : 'Confira se a pasta contém o executável sisloc.exe.';
    empty.append(heading, detail);
    listElement.append(empty);
    return;
  }

  for (const installation of visibleInstallations) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'installation-item';
    if (selectedInstallation?.id === installation.id) button.classList.add('selected');

    const icon = document.createElement('span');
    icon.className = 'installation-icon';
    icon.textContent = installation.id.startsWith('appdata:') ? 'A' : installation.isClient ? 'C' : '3';
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'installation-text';
    const name = document.createElement('strong');
    name.textContent = installation.suggestedName || installation.name;
    const description = document.createElement('span');
    description.textContent = `${installation.locationLabel} · pasta ${installation.name}`;
    text.append(name, description);

    const arrow = document.createElement('span');
    arrow.className = 'item-arrow';
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(icon, text, arrow);
    button.addEventListener('click', () => chooseInstallation(installation));
    listElement.append(button);
  }
}

async function loadInstallations() {
  refreshButton.disabled = true;
  setStatus('Procurando instalações válidas...');
  try {
    const result = await window.sisloc.listInstallations();
    installations = result.installations;
    rootElement.textContent = `${result.locations.documentsRoot} · ${result.locations.appDataRoot}`;
    rootElement.title = rootElement.textContent;
    selectedInstallation = installations.find((item) => item.id === selectedInstallation?.id) || null;
    if (selectedInstallation) {
      selectedTitle.textContent = selectedInstallation.name;
      selectedLocation.textContent = selectedInstallation.locationLabel;
      deleteButton.hidden = !selectedInstallation.isManaged;
      renameButtonLabel.textContent = selectedInstallation.isManaged ? 'Renomear pasta' : 'Renomear e criar atalho';
    } else {
      formElement.hidden = true;
      emptySelection.hidden = false;
    }
    renderInstallations();
    setStatus(installations.length
      ? `${installations.length} instalação(ões) monitorada(s).`
      : 'Nenhuma instalação com sisloc.exe foi encontrada.', installations.length ? 'success' : 'neutral');
  } catch (error) {
    setStatus(`Falha ao ler a pasta de instalações: ${error.message}`, 'error');
  } finally {
    refreshButton.disabled = false;
  }
}

formElement.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedInstallation || busy) return;

  const targetName = nameInput.value.trim();
  if (!targetName) {
    nameInput.focus();
    setStatus('Digite o nome da empresa antes de continuar.', 'error');
    return;
  }

  openActionDialog({
    type: 'rename',
    installation: selectedInstallation,
    targetName
  });
});

refreshButton.addEventListener('click', loadInstallations);
manageViewTab.addEventListener('click', () => switchMainView('manager'));
downloadViewTab.addEventListener('click', () => switchMainView('download'));
availableTab.addEventListener('click', () => switchTab('available'));
managedTab.addEventListener('click', () => switchTab('managed'));

function switchMainView(view) {
  const isManager = view === 'manager';
  managerView.hidden = !isManager;
  downloadView.hidden = isManager;
  refreshButton.hidden = !isManager;
  manageViewTab.classList.toggle('active', isManager);
  manageViewTab.setAttribute('aria-selected', String(isManager));
  downloadViewTab.classList.toggle('active', !isManager);
  downloadViewTab.setAttribute('aria-selected', String(!isManager));
  if (isManager) loadInstallations();
}

function updateHttpWarning() {
  try {
    portalHttpWarning.hidden = new URL(portalUrlInput.value.trim()).protocol !== 'http:';
  } catch {
    portalHttpWarning.hidden = true;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

portalUrlInput.addEventListener('input', updateHttpWarning);

window.sisloc.onPortalDownloadProgress((progress) => {
  downloadBusy = true;
  openPortalButton.disabled = true;
  cancelDownloadButton.hidden = false;
  downloadProgress.hidden = false;
  if (progress.percent === null) {
    downloadProgress.removeAttribute('value');
    downloadProgressPercent.textContent = '';
    downloadProgressMessage.textContent = `${progress.filename} · ${formatBytes(progress.receivedBytes)} baixados do portal`;
  } else {
    downloadProgress.value = progress.percent;
    downloadProgressPercent.textContent = `${progress.percent}%`;
    downloadProgressMessage.textContent = `${progress.filename} · ${formatBytes(progress.receivedBytes)} de ${formatBytes(progress.totalBytes)}`;
  }
});

window.sisloc.onPortalDownloadStatus((status) => {
  if (status.type === 'started') {
    downloadBusy = true;
    openPortalButton.disabled = true;
    cancelDownloadButton.disabled = false;
    cancelDownloadButton.hidden = false;
    downloadProgress.hidden = false;
    downloadProgress.removeAttribute('value');
    downloadProgressPercent.textContent = '';
    downloadProgressMessage.textContent = `Baixando ${status.filename} pelo portal...`;
    setStatus('Download iniciado pelo portal do cliente.', 'neutral');
    return;
  }

  if (!['completed', 'cancelled', 'error'].includes(status.type)) {
    setStatus(status.message, status.type === 'error' ? 'error' : 'neutral');
    return;
  }

  downloadBusy = false;
  openPortalButton.disabled = false;
  cancelDownloadButton.disabled = false;
  cancelDownloadButton.hidden = true;
  if (status.type === 'completed') {
    downloadProgress.value = 100;
    downloadProgressPercent.textContent = '100%';
    downloadProgressMessage.textContent = `Salvo em: ${status.filePath}`;
    setStatus(`Download concluído: ${status.filename}.`, 'success');
  } else {
    downloadProgress.hidden = true;
    downloadProgressMessage.textContent = status.message;
    setStatus(status.message, status.type === 'error' ? 'error' : 'neutral');
  }
});

portalForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (downloadBusy) return;

  openPortalButton.disabled = true;
  setStatus('Abrindo link isolado do cliente...');
  try {
    const result = await window.sisloc.openDownloadPortal(portalUrlInput.value.trim());
    setStatus(result.message, result.ok ? 'success' : 'error');
  } catch (error) {
    setStatus(`Não foi possível abrir o link: ${error.message}`, 'error');
  } finally {
    openPortalButton.disabled = downloadBusy;
  }
});

openDownloadFolderButton.addEventListener('click', async () => {
  openDownloadFolderButton.disabled = true;
  try {
    const result = await window.sisloc.openDownloadFolder();
    setStatus(result.message, result.ok ? 'success' : 'error');
  } catch (error) {
    setStatus(`Não foi possível abrir a pasta: ${error.message}`, 'error');
  } finally {
    openDownloadFolderButton.disabled = false;
  }
});

cancelDownloadButton.addEventListener('click', () => {
  if (downloadBusy) {
    cancelDownloadButton.disabled = true;
    downloadProgressMessage.textContent = 'Cancelando download...';
    window.sisloc.cancelPortalDownload();
  }
});

function switchTab(tab) {
  activeTab = tab;
  availableTab.classList.toggle('active', tab === 'available');
  availableTab.setAttribute('aria-selected', String(tab === 'available'));
  managedTab.classList.toggle('active', tab === 'managed');
  managedTab.setAttribute('aria-selected', String(tab === 'managed'));
  managedFilterContainer.hidden = tab !== 'managed';
  selectedInstallation = null;
  formElement.hidden = true;
  deleteButton.hidden = true;
  emptySelection.hidden = false;
  renderInstallations();
}

managedFilter.addEventListener('input', renderInstallations);

openFolderButton.addEventListener('click', async () => {
  if (!selectedInstallation || busy) return;
  openFolderButton.disabled = true;
  try {
    const result = await window.sisloc.openInstallationFolder({
      installationId: selectedInstallation.id
    });
    setStatus(result.message, result.ok ? 'success' : 'error');
  } catch (error) {
    setStatus(`Falha ao abrir a pasta: ${error.message}`, 'error');
  } finally {
    openFolderButton.disabled = false;
  }
});

deleteButton.addEventListener('click', async () => {
  if (!selectedInstallation?.isManaged || busy) return;
  openActionDialog({ type: 'delete', installation: selectedInstallation });
});

function openActionDialog(action) {
  pendingAction = action;
  const isDelete = action.type === 'delete';
  actionDialogTitle.textContent = isDelete ? 'Apagar instalação?' : 'Confirmar renomeação';
  actionDialogMessage.textContent = isDelete
    ? `A pasta "${action.installation.name}" em "${action.installation.locationLabel}" e todo o seu conteúdo serão apagados permanentemente. Essa ação não pode ser desfeita.`
    : `A pasta "${action.installation.name}" em "${action.installation.locationLabel}" será renomeada para "${action.targetName}".`;
  actionNameGroup.hidden = !isDelete;
  actionNameInput.value = '';
  actionConfirmButton.textContent = isDelete ? 'Apagar pasta' : 'Renomear';
  actionConfirmButton.classList.toggle('danger-action', isDelete);
  actionConfirmButton.classList.toggle('primary-button', !isDelete);
  actionDialog.showModal();
  if (isDelete) actionNameInput.focus();
  else actionConfirmButton.focus();
}

function closeActionDialog() {
  if (actionDialog.open) actionDialog.close();
  pendingAction = null;
  actionNameInput.value = '';
}

actionCancelButton.addEventListener('click', () => {
  closeActionDialog();
  setStatus('Ação cancelada. Nenhuma alteração foi feita.');
});

actionDialog.addEventListener('cancel', () => {
  pendingAction = null;
  actionNameInput.value = '';
  setStatus('Ação cancelada. Nenhuma alteração foi feita.');
});

actionConfirmButton.addEventListener('click', async () => {
  if (!pendingAction || busy) return;
  const action = pendingAction;
  if (action.type === 'delete') {
    const confirmationName = actionNameInput.value;
    if (confirmationName !== action.installation.name) {
      setStatus('O nome digitado não corresponde exatamente à pasta. Nada foi apagado.', 'error');
      actionNameInput.focus();
      return;
    }
    closeActionDialog();
    await deleteInstallation(action.installation, confirmationName);
    return;
  }

  closeActionDialog();
  await renameInstallation(action.installation, action.targetName);
});

async function renameInstallation(installation, targetName) {
  busy = true;
  actionConfirmButton.disabled = true;
  renameButton.disabled = true;
  setStatus('Renomeando instalação...');
  try {
    const result = await window.sisloc.renameInstallation({
      installationId: installation.id,
      targetName
    });
    setStatus(result.message, result.ok ? 'success' : 'error');
    if (result.ok || result.renamed) {
      selectedInstallation = null;
      formElement.hidden = true;
      emptySelection.hidden = false;
      await loadInstallations();
      if (installation.isManaged) switchTab('managed');
      else switchTab('available');
      setStatus(result.message, result.ok ? 'success' : 'error');
    }
  } catch (error) {
    setStatus(`Falha ao renomear a pasta: ${error.message}`, 'error');
  } finally {
    busy = false;
    actionConfirmButton.disabled = false;
    renameButton.disabled = false;
  }
}

async function deleteInstallation(installation, confirmationName) {
  busy = true;
  actionConfirmButton.disabled = true;
  renameButton.disabled = true;
  setStatus('Apagando a pasta selecionada...');
  try {
    const result = await window.sisloc.deleteInstallation({
      installationId: installation.id,
      confirmationName
    });
    setStatus(result.message, result.ok ? 'success' : 'error');
    if (result.ok) {
      selectedInstallation = null;
      formElement.hidden = true;
      emptySelection.hidden = false;
      await loadInstallations();
      switchTab('managed');
      setStatus(result.message, 'success');
    }
  } catch (error) {
    setStatus(`Falha ao apagar a pasta: ${error.message}`, 'error');
  } finally {
    busy = false;
    actionConfirmButton.disabled = false;
    renameButton.disabled = false;
  }
}

window.setInterval(() => {
  if (!busy && !document.hidden) loadInstallations();
}, 5000);
window.addEventListener('focus', () => {
  if (!busy) loadInstallations();
});

loadInstallations();
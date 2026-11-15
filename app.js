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
const deleteButton = document.getElementById('delete-installation-button');
const actionDialog = document.getElementById('action-dialog');
const actionDialogTitle = document.getElementById('action-dialog-title');
const actionDialogMessage = document.getElementById('action-dialog-message');
const actionNameGroup = document.getElementById('action-name-group');
const actionNameInput = document.getElementById('action-name-input');
const actionCancelButton = document.getElementById('action-cancel-button');
const actionConfirmButton = document.getElementById('action-confirm-button');
const renameButtonLabel = renameButton.querySelector('span');

let installations = [];
let selectedInstallation = null;
let busy = false;
let activeTab = 'available';
let pendingAction = null;

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
  const visibleInstallations = installations.filter((installation) =>
    activeTab === 'managed' ? installation.isManaged : !installation.isManaged
  );
  countElement.textContent = String(visibleInstallations.length);

  if (visibleInstallations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    const heading = document.createElement('strong');
    heading.textContent = activeTab === 'managed'
      ? 'Nenhuma instalação organizada ainda'
      : 'Nenhuma instalação para organizar';
    const detail = document.createElement('span');
    detail.textContent = activeTab === 'managed'
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
availableTab.addEventListener('click', () => switchTab('available'));
managedTab.addEventListener('click', () => switchTab('managed'));

function switchTab(tab) {
  activeTab = tab;
  availableTab.classList.toggle('active', tab === 'available');
  availableTab.setAttribute('aria-selected', String(tab === 'available'));
  managedTab.classList.toggle('active', tab === 'managed');
  managedTab.setAttribute('aria-selected', String(tab === 'managed'));
  selectedInstallation = null;
  formElement.hidden = true;
  deleteButton.hidden = true;
  emptySelection.hidden = false;
  renderInstallations();
}

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
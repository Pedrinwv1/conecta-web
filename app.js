import { initSocket, waitForConnection } from './js/socket.js';
import { enterRoom, leaveRoom, initCallUi, onCallChange, inviteUrl } from './js/call.js';
import { initSettings, refreshDevices, stopPreview } from './js/settings.js';
import { getPrefs, savePrefs } from './js/store.js';
import { $, toast, setBusy, copyLink, shareLink } from './js/ui.js';

const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;
const normalizeCode = (value) => {
  const code = String(value ?? '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_PATTERN.test(code) ? code : null;
};
const cleanName = (value) => {
  const name = String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return name && name.length <= 30 ? name : null;
};

/* ---------- Navegação ---------- */
const pages = { inicio: $('#page-inicio'), chamadas: $('#page-chamadas'), configuracoes: $('#page-config') };
const titles = { inicio: 'Início', chamadas: 'Chamadas', configuracoes: 'Configurações' };
let currentPage = null;

function route() {
  const requested = location.hash.replace(/^#\/?/, '') || 'inicio';
  const key = Object.hasOwn(pages, requested) ? requested : 'inicio';
  if (currentPage === 'configuracoes' && key !== 'configuracoes') stopPreview();
  for (const [name, el] of Object.entries(pages)) el.hidden = name !== key;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${titles[key]} · Conecta Web`;
  if (key === 'configuracoes' && currentPage !== key) refreshDevices();
  currentPage = key;
}

/* ---------- Estado da conexão ---------- */
let socketBound = false;
function setConn(state, text) {
  $('#conn-dot').dataset.state = state;
  $('#conn-text').textContent = text;
}
function showBanner(message) {
  $('#conn-banner-text').textContent = message;
  $('#conn-banner').hidden = false;
}

async function startConnection() {
  setConn('connecting', 'Conectando…');
  try {
    const socket = initSocket();
    if (!socketBound) {
      socketBound = true;
      socket.on('connect', () => { setConn('online', 'Conectado'); $('#conn-banner').hidden = true; });
      socket.on('disconnect', () => setConn('offline', 'Sem conexão'));
      socket.on('connect_error', () => {
        setConn('offline', 'Sem conexão');
        showBanner('Servidor indisponível ou conexão instável. Continuaremos tentando reconectar.');
      });
    }
    await waitForConnection();
  } catch (err) {
    setConn('offline', 'Sem conexão');
    showBanner(err.message);
  }
}

/* ---------- Início ---------- */
const nameInput = $('#user-name');
const codeInput = $('#room-code');
const errorBox = $('#home-error');
const showError = (message) => { errorBox.textContent = message; errorBox.hidden = false; };

async function submit(mode) {
  errorBox.hidden = true;
  const name = cleanName(nameInput.value);
  if (!name) { showError('Informe seu nome (até 30 caracteres).'); nameInput.focus(); return; }
  let code = null;
  if (mode === 'join') {
    code = normalizeCode(codeInput.value);
    if (!code) { showError('Código de sala inválido. Ele tem 10 letras e números, sem 0, O, 1 ou I.'); codeInput.focus(); return; }
  }
  savePrefs({ name });
  const buttons = [$('#btn-create'), $('#btn-join')];
  setBusy(buttons, true);
  try {
    await enterRoom({ mode, name, code });
    location.hash = '#/chamadas';
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(buttons, false);
  }
}

function renderRecent() {
  const list = $('#recent-list');
  const { recent } = getPrefs();
  list.replaceChildren();
  $('#recent-empty').hidden = recent.length > 0;
  for (const { code } of recent) {
    const li = document.createElement('li');
    const label = document.createElement('code');
    label.textContent = code;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary';
    btn.textContent = 'Usar código';
    btn.addEventListener('click', () => { codeInput.value = code; codeInput.focus(); });
    li.append(label, btn);
    list.append(li);
  }
}

function renderInvite({ active, code }) {
  const url = active ? inviteUrl(code) : '';
  $('#invite-link').value = url;
  $('#btn-copy').disabled = !url;
  $('#btn-share').disabled = !url;
  $('#invite-hint').textContent = url ? `Envie este link para convidar pessoas para a sala ${code}.` : 'Crie ou entre em uma sala para gerar o link.';
  renderRecent();
}

function readInviteFromUrl() {
  const params = new URLSearchParams(location.search);
  if (!params.has('sala')) return;
  const code = normalizeCode(params.get('sala'));
  if (code) {
    codeInput.value = code;
    toast('Convite carregado. Informe seu nome e clique em “Entrar na sala”.', 'success', 7000);
  } else {
    showError('Link de convite inválido. Peça um novo link a quem convidou você.');
  }
  history.replaceState(null, '', `${location.pathname}${location.hash}`);
}

/* ---------- Inicialização ---------- */
nameInput.value = getPrefs().name;
$('#btn-create').addEventListener('click', () => { submit('create'); });
$('#btn-join').addEventListener('click', () => { submit('join'); });
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit('join'); });
$('#btn-copy').addEventListener('click', () => copyLink(inviteUrl()));
$('#btn-share').addEventListener('click', () => { shareLink(inviteUrl()); });
$('#conn-retry').addEventListener('click', () => {
  if (typeof window.io !== 'function') location.reload(); else startConnection();
});
onCallChange(renderInvite);
initCallUi();
initSettings();
renderInvite({ active: false, code: null });
readInviteFromUrl();
window.addEventListener('hashchange', route);
route();
startConnection();

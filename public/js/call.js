import { request, waitForConnection, getSocket } from './socket.js';
import { checkSupport, describeMediaError, getLocalStream, getScreenStream, stopStream } from './media.js';
import { Call } from './peers.js';
import { getPrefs, addRecent } from './store.js';
import { $, toast, createTile, setIcon, copyLink } from './ui.js';

const STATUS_TEXT = { connecting: 'Conectando…', connected: 'Conectado', reconnecting: 'Reconectando…', failed: 'Falha na conexão' };
const state = {
  active: false, joining: false, lost: false, code: null, name: '',
  call: null, local: null, screen: null, rtcConfig: null, tiles: new Map(), handlers: null,
};
const subscribers = new Set();

export const onCallChange = (fn) => subscribers.add(fn);
export const isInCall = () => state.active;
export const inviteUrl = (code = state.code) => (code ? `${location.origin}/?sala=${code}` : '');
const notify = () => subscribers.forEach((fn) => fn({ active: state.active, code: state.code }));

function setStatus(text, kind = 'warn') {
  const el = $('#call-status');
  el.textContent = text;
  el.dataset.state = kind;
}

async function loadRtcConfig() {
  let response;
  try {
    response = await fetch('/api/config', { cache: 'no-store' });
  } catch (err) {
    console.error('Falha ao buscar /api/config', err);
    throw new Error('Servidor indisponível. Confirme que o Conecta Web está em execução e tente novamente.');
  }
  if (!response.ok) throw new Error('O servidor recusou a configuração da chamada. Aguarde um instante e tente novamente.');
  const data = await response.json();
  state.rtcConfig = { iceServers: Array.isArray(data.iceServers) ? data.iceServers : [] };
}

function updateGridCount() {
  $('#video-grid').dataset.count = String(state.tiles.size);
}

function ensureTile(id, name, local = false) {
  let tile = state.tiles.get(id);
  if (tile) { tile.setName(name); return tile; }
  tile = createTile({ id, name, local });
  state.tiles.set(id, tile);
  $('#video-grid').append(tile.el);
  updateGridCount();
  return tile;
}

function removeTile(id) {
  state.tiles.get(id)?.el.remove();
  state.tiles.delete(id);
  updateGridCount();
}

function clearRemoteTiles() {
  for (const id of [...state.tiles.keys()]) if (id !== 'local') removeTile(id);
}

function buildCall(socket) {
  state.call = new Call({
    socket, rtcConfig: state.rtcConfig, localStream: state.local,
    onPeerAdded: (peer) => ensureTile(peer.id, peer.name),
    onPeerRemoved: (id) => removeTile(id),
    onStream: (id, stream) => state.tiles.get(id)?.setStream(stream),
    onPeerStatus: (id, status) => {
      state.tiles.get(id)?.setStatus(status, STATUS_TEXT[status] ?? '');
      const peers = [...(state.call?.peers.values() ?? [])];
      if (status === 'failed') setStatus('Falha ao conectar com um participante', 'error');
      else if (peers.length && peers.every((p) => p.pc.connectionState === 'connected')) setStatus('Conectado', 'ok');
      else if (peers.length) setStatus('Conectando…', 'warn');
    },
    onError: (err, context, peer) => {
      console.error(`Erro WebRTC (${context})`, err);
      if (context === 'connection') {
        toast(`Não foi possível conectar com ${peer?.name ?? 'um participante'}. Em algumas redes é necessário configurar um servidor TURN.`, 'error', 9000);
      }
    },
  });
}

function addPeers(list) {
  for (const p of Array.isArray(list) ? list : []) state.call?.addPeer(p.id, typeof p.name === 'string' ? p.name : 'Participante');
}

function attachSocketListeners(socket) {
  detachSocketListeners();
  const handlers = {
    'peer:joined': (payload) => {
      const { id, name } = payload ?? {};
      if (typeof id !== 'string' || !state.call) return;
      state.call.addPeer(id, typeof name === 'string' ? name : 'Participante');
      toast(`${name ?? 'Alguém'} entrou na sala.`);
    },
    'peer:left': (payload) => {
      const { id } = payload ?? {};
      if (typeof id !== 'string' || !state.call) return;
      const name = state.call.peers.get(id)?.name;
      state.call.removePeer(id);
      if (name) toast(`${name} saiu da sala.`);
    },
    signal: (message) => state.call?.handleSignal(message ?? {}),
    disconnect: (reason) => {
      if (!state.active) return;
      state.lost = true;
      setStatus('Conexão com o servidor perdida. Tentando reconectar…', 'error');
      if (reason === 'io server disconnect') socket.connect();
    },
    connect: () => { if (state.active && state.lost) rejoin(); },
  };
  for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);
  state.handlers = { socket, handlers };
}

function detachSocketListeners() {
  if (!state.handlers) return;
  const { socket, handlers } = state.handlers;
  for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
  state.handlers = null;
}

async function rejoin() {
  state.lost = false;
  setStatus('Reconectando à sala…', 'warn');
  try {
    const socket = getSocket();
    state.call?.stop();
    clearRemoteTiles();
    buildCall(socket); // o id do socket mudou: nova malha com o novo id
    const res = await request('room:join', { name: state.name, code: state.code });
    if (!res?.ok) throw new Error(res?.message || 'Não foi possível voltar para a sala.');
    addPeers(res.peers);
    setStatus(res.peers.length ? 'Conectando…' : 'Conectado', res.peers.length ? 'warn' : 'ok');
    toast('Reconectado à sala.', 'success');
  } catch (err) {
    toast(`${err.message} A chamada foi encerrada.`, 'error', 8000);
    await leaveRoom();
    location.hash = '#/inicio';
  }
}

function showCallUi() {
  $('#call-empty').hidden = true;
  $('#call-active').hidden = false;
  $('#nav-live').hidden = false;
  $('#call-code').textContent = state.code;
  ensureTile('local', state.name, true).setStream(state.local);
  renderControls();
  setStatus(state.call.peers.size ? 'Conectando…' : 'Aguardando participantes', state.call.peers.size ? 'warn' : 'ok');
}

function hideCallUi() {
  $('#call-empty').hidden = false;
  $('#call-active').hidden = true;
  $('#nav-live').hidden = true;
}

export async function enterRoom({ mode, name, code }) {
  if (state.active || state.joining) throw new Error('Você já está em uma chamada. Saia dela antes de entrar em outra.');
  const unsupported = checkSupport();
  if (unsupported) throw new Error(unsupported);
  state.joining = true;
  try {
    const socket = await waitForConnection();
    await loadRtcConfig();
    let media;
    try { media = await getLocalStream(getPrefs()); } catch (err) { throw new Error(describeMediaError(err)); }
    state.local = media.stream;
    media.warnings.forEach((w) => toast(w, 'warn', 7000));
    state.name = name;
    attachSocketListeners(socket); // antes de entrar, para não perder eventos
    buildCall(socket);
    const res = await request(mode === 'create' ? 'room:create' : 'room:join', mode === 'create' ? { name } : { name, code });
    if (!res?.ok) throw new Error(res?.message || 'Não foi possível entrar na sala.');
    state.code = res.code;
    state.active = true;
    addRecent(res.code);
    addPeers(res.peers);
    showCallUi();
    notify();
  } catch (err) {
    teardown();
    throw err;
  } finally {
    state.joining = false;
  }
}

function teardown() {
  detachSocketListeners();
  state.call?.stop();
  stopStream(state.local);
  stopStream(state.screen);
  for (const id of [...state.tiles.keys()]) removeTile(id);
  Object.assign(state, { active: false, lost: false, code: null, call: null, local: null, screen: null });
  hideCallUi();
  notify();
}

export async function leaveRoom() {
  if (!state.active && !state.local) return;
  if (state.active) {
    try {
      await request('room:leave', {}, 3000);
    } catch (err) {
      console.warn('Não foi possível avisar o servidor da saída (ele limpará ao detectar a desconexão).', err);
    }
  }
  teardown();
}

function renderControls() {
  const audio = state.local?.getAudioTracks()[0] ?? null;
  const video = state.local?.getVideoTracks()[0] ?? null;
  const mic = $('#btn-mic');
  const cam = $('#btn-cam');
  mic.disabled = !audio;
  mic.setAttribute('aria-pressed', String(Boolean(audio && !audio.enabled)));
  setIcon(mic, audio?.enabled ? 'i-mic' : 'i-mic-off');
  mic.querySelector('span').textContent = !audio ? 'Sem microfone' : audio.enabled ? 'Microfone' : 'Microfone desligado';
  cam.disabled = !video || Boolean(state.screen);
  cam.setAttribute('aria-pressed', String(Boolean(video && !video.enabled)));
  setIcon(cam, video?.enabled ? 'i-video' : 'i-video-off');
  cam.querySelector('span').textContent = !video ? 'Sem câmera' : video.enabled ? 'Câmera' : 'Câmera desligada';
  const screenBtn = $('#btn-screen');
  screenBtn.setAttribute('aria-pressed', String(Boolean(state.screen)));
  screenBtn.querySelector('span').textContent = state.screen ? 'Parar compartilhamento' : 'Compartilhar tela';
  const local = state.tiles.get('local');
  local?.el.classList.toggle('cam-off', !state.screen && (!video || !video.enabled));
  local?.el.classList.toggle('is-sharing', Boolean(state.screen));
}

function toggleTrack(kind) {
  const tracks = kind === 'audio' ? state.local?.getAudioTracks() : state.local?.getVideoTracks();
  const track = tracks?.[0];
  if (!track) { toast(kind === 'audio' ? 'Nenhum microfone disponível.' : 'Nenhuma câmera disponível.', 'warn'); return; }
  track.enabled = !track.enabled; // sem renegociar: a chamada não é interrompida
  renderControls();
}

async function toggleScreen() {
  if (state.screen) { await stopScreen(); return; }
  if (!state.call) return;
  try {
    const stream = await getScreenStream();
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => { stopScreen(); }); // botão "Parar" do próprio navegador
    state.screen = stream;
    await state.call.setLocalVideoTrack(track);
    state.tiles.get('local')?.setStream(stream);
    renderControls();
  } catch (err) {
    state.screen = null;
    if (err?.name === 'NotSupportedError') toast('Seu navegador não permite compartilhar a tela.', 'error');
    else if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') toast('Compartilhamento de tela cancelado.', 'info');
    else { console.error('Erro ao compartilhar tela', err); toast('Não foi possível compartilhar a tela.', 'error'); }
    renderControls();
  }
}

async function stopScreen() {
  if (!state.screen) return;
  stopStream(state.screen);
  state.screen = null;
  const camera = state.local?.getVideoTracks()[0] ?? null;
  await state.call?.setLocalVideoTrack(camera); // volta para a câmera anterior (ou nenhuma)
  state.tiles.get('local')?.setStream(state.local);
  renderControls();
}

export function initCallUi() {
  $('#btn-mic').addEventListener('click', () => toggleTrack('audio'));
  $('#btn-cam').addEventListener('click', () => toggleTrack('video'));
  $('#btn-screen').addEventListener('click', () => { toggleScreen(); });
  $('#btn-call-copy').addEventListener('click', () => copyLink(inviteUrl()));
  $('#btn-leave').addEventListener('click', async () => {
    await leaveRoom();
    location.hash = '#/inicio';
  });
  window.addEventListener('pagehide', () => { if (state.local) teardown(); });
}

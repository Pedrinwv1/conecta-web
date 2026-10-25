import { getLocalStream, describeMediaError, listDevices, stopStream, checkSupport } from './media.js';
import { getPrefs, savePrefs } from './store.js';
import { $, toast, setBusy } from './ui.js';

let stream = null;
let audioCtx = null;
let rafId = 0;

function fillSelect(select, devices, selectedId, fallbackLabel) {
  select.replaceChildren();
  select.append(new Option('Padrão do sistema', ''));
  devices.forEach((d, i) => select.append(new Option(d.label || `${fallbackLabel} ${i + 1}`, d.deviceId)));
  select.value = devices.some((d) => d.deviceId === selectedId) ? selectedId : '';
}

export async function refreshDevices() {
  try {
    const { cams, mics } = await listDevices();
    const prefs = getPrefs();
    fillSelect($('#sel-cam'), cams, prefs.camId, 'Câmera');
    fillSelect($('#sel-mic'), mics, prefs.micId, 'Microfone');
  } catch (err) {
    console.error('Não foi possível listar dispositivos', err);
    toast('Não foi possível listar câmeras e microfones.', 'error');
  }
}

export function stopPreview() {
  cancelAnimationFrame(rafId);
  audioCtx?.close().catch((err) => console.debug('AudioContext já fechado', err));
  audioCtx = null;
  stopStream(stream);
  stream = null;
  const video = $('#preview');
  video.srcObject = null;
  $('#meter-bar').style.width = '0%';
}

function startMeter(mediaStream) {
  const audioTracks = mediaStream.getAudioTracks();
  if (!audioTracks.length || !window.AudioContext) return;
  audioCtx = new AudioContext();
  audioCtx.resume().catch((err) => console.debug('AudioContext não retomou', err));
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  audioCtx.createMediaStreamSource(new MediaStream(audioTracks)).connect(analyser); // sem saída: não gera eco
  const data = new Uint8Array(analyser.fftSize);
  const bar = $('#meter-bar');
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
    bar.style.width = `${Math.min(100, (peak / 128) * 160)}%`;
    rafId = requestAnimationFrame(tick);
  };
  tick();
}

async function startPreview() {
  const unsupported = checkSupport();
  if (unsupported) { toast(unsupported, 'error', 8000); return; }
  const btn = $('#btn-preview');
  stopPreview();
  setBusy(btn, true);
  try {
    const result = await getLocalStream({ camId: $('#sel-cam').value, micId: $('#sel-mic').value });
    stream = result.stream;
    $('#preview').srcObject = stream;
    result.warnings.forEach((w) => toast(w, 'warn'));
    await refreshDevices(); // agora os nomes dos dispositivos estão disponíveis
    startMeter(stream);
    $('#preview-msg').textContent = 'Fale algo: a barra deve se mover.';
  } catch (err) {
    $('#preview-msg').textContent = describeMediaError(err);
    toast(describeMediaError(err), 'error', 8000);
  } finally {
    setBusy(btn, false);
  }
}

export function initSettings() {
  $('#settings-name').value = getPrefs().name;
  $('#btn-save-name').addEventListener('click', () => {
    const name = $('#settings-name').value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > 30) { toast('Informe um nome com 1 a 30 caracteres.', 'error'); return; }
    savePrefs({ name });
    $('#user-name').value = name;
    toast('Nome salvo.', 'success');
  });
  $('#sel-cam').addEventListener('change', (e) => savePrefs({ camId: e.target.value }));
  $('#sel-mic').addEventListener('change', (e) => savePrefs({ micId: e.target.value }));
  $('#btn-preview').addEventListener('click', () => { startPreview(); });
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
}

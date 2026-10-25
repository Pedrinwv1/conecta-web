export function checkSupport() {
  if (!window.isSecureContext) {
    return 'Chamadas exigem uma conexão segura. Use http://localhost:3000 ou um endereço HTTPS.';
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof window.RTCPeerConnection !== 'function') {
    return 'Seu navegador não é compatível com chamadas de vídeo. Use uma versão recente do Chrome, Edge, Firefox ou Safari.';
  }
  return null;
}

export function describeMediaError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permissão negada. Clique no cadeado ao lado do endereço, libere câmera e microfone e tente novamente.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenhuma câmera ou microfone foi encontrado. Conecte um dispositivo e tente novamente.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Não foi possível acessar a câmera ou o microfone. Feche outros programas que possam estar usando o dispositivo.';
    default:
      return `Falha ao acessar câmera e microfone: ${err?.message || 'erro desconhecido'}.`;
  }
}

const isPermissionError = (err) => err?.name === 'NotAllowedError' || err?.name === 'SecurityError';

export async function getLocalStream({ camId = '', micId = '' } = {}) {
  const audio = { echoCancellation: true, noiseSuppression: true, ...(micId ? { deviceId: { ideal: micId } } : {}) };
  const video = { width: { ideal: 1280 }, height: { ideal: 720 }, ...(camId ? { deviceId: { ideal: camId } } : {}) };
  const attempts = [
    [{ audio, video }, null],
    [{ audio }, 'Câmera indisponível: você entrou somente com o microfone.'],
    [{ video }, 'Microfone indisponível: você entrou somente com a câmera.'],
  ];
  let firstError = null;
  for (const [constraints, warning] of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return { stream, warnings: warning ? [warning] : [] };
    } catch (err) {
      firstError ??= err;
      if (isPermissionError(err)) throw err;
      console.warn('getUserMedia falhou com', constraints, err);
    }
  }
  throw firstError;
}

export async function getScreenStream() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    const err = new Error('Compartilhamento de tela não é suportado neste navegador.');
    err.name = 'NotSupportedError';
    throw err;
  }
  return navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
}

export async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return { cams: [], mics: [] };
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    cams: devices.filter((d) => d.kind === 'videoinput'),
    mics: devices.filter((d) => d.kind === 'audioinput'),
  };
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

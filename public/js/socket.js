// Cliente Socket.IO. Todo acesso passa por aqui: nada usa o socket sem antes
// garantir que ele existe e que a conexão foi estabelecida.
export class ConnectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConnectionError';
  }
}

const CONNECT_TIMEOUT_MS = 8000;
let socket = null;

export function initSocket() {
  if (socket) return socket;
  if (typeof window.io !== 'function') {
    throw new ConnectionError('Não foi possível carregar a biblioteca de conexão. Verifique se o servidor está em execução e recarregue a página.');
  }
  socket = window.io({ reconnectionDelay: 800, reconnectionDelayMax: 5000 });
  return socket;
}

export function getSocket() {
  if (!socket) throw new ConnectionError('A conexão ainda não foi iniciada. Recarregue a página.');
  return socket;
}

export function waitForConnection(timeoutMs = CONNECT_TIMEOUT_MS) {
  const s = initSocket();
  if (s.connected) return Promise.resolve(s);
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); s.off('connect', onConnect); };
    const onConnect = () => { cleanup(); resolve(s); };
    const timer = setTimeout(() => {
      cleanup();
      reject(new ConnectionError('Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.'));
    }, timeoutMs);
    s.on('connect', onConnect);
    if (s.disconnected) s.connect();
  });
}

export async function request(event, payload = {}, timeoutMs = 8000) {
  const s = await waitForConnection();
  return new Promise((resolve, reject) => {
    s.timeout(timeoutMs).emit(event, payload, (err, response) => {
      if (err) reject(new ConnectionError('O servidor demorou para responder. Tente novamente.'));
      else resolve(response);
    });
  });
}

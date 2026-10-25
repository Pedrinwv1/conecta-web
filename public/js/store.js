const KEY = 'conectaweb:v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch (err) {
    console.warn('Preferências ilegíveis; usando padrões.', err);
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Não foi possível salvar as preferências neste navegador.', err);
  }
}

export function getPrefs() {
  const d = read();
  return {
    name: typeof d.name === 'string' ? d.name : '',
    camId: typeof d.camId === 'string' ? d.camId : '',
    micId: typeof d.micId === 'string' ? d.micId : '',
    recent: Array.isArray(d.recent) ? d.recent.filter((r) => r && typeof r.code === 'string') : [],
  };
}

export function savePrefs(patch) {
  write({ ...read(), ...patch });
}

export function addRecent(code) {
  const { recent } = getPrefs();
  savePrefs({ recent: [{ code, at: Date.now() }, ...recent.filter((r) => r.code !== code)].slice(0, 5) });
}

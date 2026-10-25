export const $ = (selector, root = document) => root.querySelector(selector);

export function toast(message, type = 'info', ms = 5000) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.type = type;
  el.textContent = message;
  box.append(el);
  setTimeout(() => el.remove(), ms);
}

export function setBusy(buttons, busy) {
  for (const btn of [].concat(buttons)) {
    btn.disabled = busy;
    btn.classList.toggle('is-loading', busy);
    btn.setAttribute('aria-busy', String(busy));
  }
}

export function setIcon(button, iconId) {
  button.querySelector('use')?.setAttribute('href', `#${iconId}`);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn('Área de transferência indisponível; usando alternativa.', err);
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'sr-only';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { console.warn('Cópia falhou.', e); }
    area.remove();
    return ok;
  }
}

export async function copyLink(url) {
  if (!url) return;
  toast(await copyText(url) ? 'Link copiado.' : 'Não foi possível copiar. Selecione o link e copie manualmente.', 'info');
}

export async function shareLink(url) {
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Conecta Web', text: 'Entre na minha chamada no Conecta Web:', url });
    } catch (err) {
      if (err?.name !== 'AbortError') toast('Não foi possível compartilhar. Tente copiar o link.', 'error');
    }
    return;
  }
  toast(await copyText(url) ? 'Este navegador não tem compartilhamento nativo. O link foi copiado.' : 'Compartilhamento indisponível. Copie o link manualmente.', 'warn');
}

export function createTile({ id, name, local = false }) {
  const el = document.createElement('figure');
  el.className = local ? 'tile tile-local' : 'tile';
  el.dataset.peer = id;
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = local; // nunca reproduz o próprio áudio (evita eco)
  const caption = document.createElement('figcaption');
  const label = document.createElement('span');
  const status = document.createElement('span');
  status.className = 'tile-status';
  caption.append(label, status);
  el.append(video, caption);
  const api = {
    el, video,
    setName(value) {
      label.textContent = local ? `${value} (você)` : value;
      el.dataset.initial = (value.trim()[0] || '?').toUpperCase();
    },
    setStatus(state, text) { status.dataset.state = state; status.textContent = text; },
    setStream(stream) {
      if (video.srcObject !== stream) video.srcObject = stream;
      video.play?.().catch((err) => console.debug('Reprodução automática adiada:', err?.name));
    },
  };
  api.setName(name);
  return api;
}

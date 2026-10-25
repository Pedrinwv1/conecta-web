'use strict';
// Testes de integração com servidor, HTTP e Socket.IO reais.
// São ignorados automaticamente se as dependências ainda não foram instaladas (npm install).
const test = require('node:test');
const assert = require('node:assert/strict');

const has = (name) => { try { require.resolve(name); return true; } catch { return false; } };
const missing = ['express', 'socket.io', 'socket.io-client'].filter((n) => !has(n));
const skip = missing.length ? `dependências ausentes (${missing.join(', ')}): execute npm install` : false;

test('servidor + Socket.IO reais', { skip }, async (t) => {
  const { createServer } = require('../server');
  const { io: connectClient } = require('socket.io-client');
  const { loadConfig } = require('../lib/config');
  const server = createServer({ ...loadConfig({ MAX_PARTICIPANTS: '2', RATE_LIMIT_MAX: '200' }), port: 0 });
  const { port } = await server.start(0);
  const base = `http://127.0.0.1:${port}`;
  const clients = [];
  const open = async () => {
    const c = connectClient(base, { transports: ['websocket'], reconnection: false });
    clients.push(c);
    await new Promise((resolve, reject) => { c.once('connect', resolve); c.once('connect_error', reject); });
    return c;
  };
  const ask = (c, event, payload) => new Promise((resolve) => c.emit(event, payload, resolve));
  const next = (c, event) => new Promise((resolve) => c.once(event, resolve));
  t.after(async () => { clients.forEach((c) => c.close()); await server.stop(); });

  await t.test('página inicial, saúde, config e cabeçalhos', async () => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Mais perto\. Mesmo de longe\./);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('x-powered-by'), null);
    assert.equal((await (await fetch(`${base}/healthz`)).json()).status, 'ok');
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.ok(Array.isArray(cfg.iceServers));
    assert.equal((await fetch(`${base}/api/inexistente`)).status, 404);
    assert.equal((await fetch(`${base}/socket.io/socket.io.js`)).status, 200);
  });

  await t.test('criar, entrar, sinalizar, lotação e saída', async () => {
    const a = await open(); const b = await open(); const c = await open();
    const created = await ask(a, 'room:create', { name: 'Ana' });
    assert.equal(created.ok, true);
    const joinedEvent = next(a, 'peer:joined');
    const joined = await ask(b, 'room:join', { name: 'Bia', code: created.code });
    assert.equal(joined.ok, true);
    assert.equal((await joinedEvent).name, 'Bia');
    assert.equal((await ask(c, 'room:join', { name: 'Cris', code: created.code })).code, 'ROOM_FULL');
    assert.equal((await ask(c, 'room:join', { name: 'Cris', code: 'invalido' })).code, 'INVALID_CODE');

    const got = next(b, 'signal');
    a.emit('signal', { to: b.id, description: { type: 'offer', sdp: 'v=0' } });
    assert.equal((await got).from, a.id);

    const left = next(a, 'peer:left');
    b.close();
    assert.equal((await left).id, b.id);
    a.close();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(server.rooms.roomCount(), 0);
  });
});

'use strict';
// Testa o módulo public/js/socket.js (ES module) com um "io" falso. Cobre os erros relatados:
// "Cannot read properties of null (reading 'connected')", "conexão ainda não está pronta",
// "cliente de conexão não foi iniciado".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { EventEmitter } = require('events');

let counter = 0;
async function loadFresh() {
  const file = path.join(os.tmpdir(), `socket-under-test-${process.pid}-${counter += 1}.mjs`);
  fs.copyFileSync(path.join(__dirname, '..', 'public', 'js', 'socket.js'), file);
  return import(pathToFileURL(file).href);
}

class FakeClientSocket extends EventEmitter {
  constructor() { super(); this.connected = false; this.disconnected = true; }
  connect() { this.disconnected = false; }
  timeout() { return { emit: (event, payload, cb) => { this.lastEmit = { event, payload }; cb(this.ackError ?? null, this.ackValue); } }; }
  open() { this.connected = true; this.disconnected = false; this.emit('connect'); }
}

test('getSocket antes de iniciar lança erro claro (não TypeError de null)', async () => {
  const mod = await loadFresh();
  assert.throws(() => mod.getSocket(), (err) => err instanceof mod.ConnectionError && /não foi iniciada/.test(err.message));
});

test('initSocket sem a biblioteca Socket.IO explica o problema', async () => {
  global.window = {};
  const mod = await loadFresh();
  assert.throws(() => mod.initSocket(), /biblioteca de conexão/);
  assert.throws(() => mod.getSocket(), mod.ConnectionError);
});

test('waitForConnection espera a conexão e só então resolve', async () => {
  const fake = new FakeClientSocket();
  global.window = { io: () => fake };
  const mod = await loadFresh();
  let resolved = false;
  const pending = mod.waitForConnection(1000).then((s) => { resolved = true; return s; });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(resolved, false, 'não deve resolver antes de conectar');
  fake.open();
  assert.equal(await pending, fake);
});

test('waitForConnection falha com mensagem clara no tempo limite', async () => {
  global.window = { io: () => new FakeClientSocket() };
  const mod = await loadFresh();
  await assert.rejects(mod.waitForConnection(30), /Não foi possível conectar ao servidor/);
});

test('request aguarda a conexão, envia e devolve o ack; trata timeout do ack', async () => {
  const fake = new FakeClientSocket();
  fake.ackValue = { ok: true, code: 'X' };
  global.window = { io: () => fake };
  const mod = await loadFresh();
  setTimeout(() => fake.open(), 10);
  assert.deepEqual(await mod.request('room:create', { name: 'A' }), { ok: true, code: 'X' });
  assert.equal(fake.lastEmit.event, 'room:create');
  fake.ackError = new Error('timeout');
  await assert.rejects(mod.request('room:create', {}), /servidor demorou/);
});

test.after(() => { delete global.window; });

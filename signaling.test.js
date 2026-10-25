'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeIO } = require('./helpers/fakeIo');
const { RoomManager } = require('../lib/rooms');
const { createLimiter } = require('../lib/rateLimit');
const { registerSignaling } = require('../lib/signaling');

function setup({ max = 3, roomLimit = 100 } = {}) {
  const io = new FakeIO();
  const rooms = new RoomManager({ maxParticipants: max });
  const limiters = { room: createLimiter({ windowMs: 60000, max: roomLimit }), signal: createLimiter({ windowMs: 10000, max: 1000 }) };
  registerSignaling(io, { rooms, limiters, logger: { error() {} } });
  return { io, rooms, close: () => Object.values(limiters).forEach((l) => l.close()) };
}

test('criar sala devolve código válido e o criador fica na sala', async (t) => {
  const { io, rooms, close } = setup(); t.after(close);
  const a = io.connect('a');
  const res = await a.call('room:create', { name: 'Ana' });
  assert.equal(res.ok, true);
  assert.match(res.code, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.deepEqual(res.peers, []);
  assert.equal(rooms.hasPeer(res.code, 'a'), true);
});

test('entrar em sala: recebe lista e os demais são avisados', async (t) => {
  const { io, close } = setup(); t.after(close);
  const a = io.connect('a'); const b = io.connect('b');
  const { code } = await a.call('room:create', { name: 'Ana' });
  const res = await b.call('room:join', { name: 'Bia', code: code.toLowerCase() });
  assert.equal(res.ok, true);
  assert.deepEqual(res.peers, [{ id: 'a', name: 'Ana' }]);
  assert.deepEqual(a.events('peer:joined'), [{ id: 'b', name: 'Bia' }]);
  assert.equal(b.events('peer:joined').length, 0);
});

test('rejeita código inválido, sala inexistente e nome inválido', async (t) => {
  const { io, close } = setup(); t.after(close);
  const b = io.connect('b');
  assert.equal((await b.call('room:join', { name: 'Bia', code: 'curto' })).code, 'INVALID_CODE');
  assert.equal((await b.call('room:join', { name: 'Bia', code: 'ABCDEFGHJK' })).code, 'ROOM_NOT_FOUND');
  assert.equal((await b.call('room:join', { name: '  ', code: 'ABCDEFGHJK' })).code, 'INVALID_NAME');
  assert.equal((await b.call('room:create', null)).code, 'INVALID_NAME');
  assert.equal((await b.call('room:join', undefined)).code, 'INVALID_NAME');
});

test('limite de participantes por sala', async (t) => {
  const { io, close } = setup({ max: 2 }); t.after(close);
  const [a, b, c] = ['a', 'b', 'c'].map((id) => io.connect(id));
  const { code } = await a.call('room:create', { name: 'A' });
  assert.equal((await b.call('room:join', { name: 'B', code })).ok, true);
  const full = await c.call('room:join', { name: 'C', code });
  assert.equal(full.code, 'ROOM_FULL');
  assert.match(full.message, /lotada/);
});

test('não permite entrar em duas salas com o mesmo socket', async (t) => {
  const { io, close } = setup(); t.after(close);
  const a = io.connect('a');
  await a.call('room:create', { name: 'A' });
  assert.equal((await a.call('room:create', { name: 'A' })).code, 'ALREADY_IN_ROOM');
});

test('sinalização é entregue apenas ao destinatário da mesma sala', async (t) => {
  const { io, close } = setup(); t.after(close);
  const [a, b, c] = ['a', 'b', 'c'].map((id) => io.connect(id));
  const { code } = await a.call('room:create', { name: 'A' });
  await b.call('room:join', { name: 'B', code });
  await c.call('room:join', { name: 'C', code });
  a.fire('signal', { to: 'b', description: { type: 'offer', sdp: 'v=0' } });
  a.fire('signal', { to: 'b', candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } });
  assert.equal(b.events('signal').length, 2);
  assert.equal(b.events('signal')[0].from, 'a');
  assert.equal(c.events('signal').length, 0);
});

test('rejeita sinais de quem não está em sala, para outra sala e inválidos', async (t) => {
  const { io, close } = setup(); t.after(close);
  const [a, b, outsider, other] = ['a', 'b', 'x', 'y'].map((id) => io.connect(id));
  const { code } = await a.call('room:create', { name: 'A' });
  await b.call('room:join', { name: 'B', code });
  await other.call('room:create', { name: 'Y' });
  const offer = { description: { type: 'offer', sdp: 'v=0' } };
  outsider.fire('signal', { to: 'a', ...offer });   // fora de qualquer sala
  other.fire('signal', { to: 'a', ...offer });      // em outra sala
  a.fire('signal', { to: 'y', ...offer });          // destino em outra sala
  a.fire('signal', { to: 'a', ...offer });          // para si mesmo
  a.fire('signal', { to: 'b', description: { type: 'hack' } }); // inválido
  a.fire('signal', 'lixo');
  assert.equal(a.events('signal').length, 0);
  assert.equal(b.events('signal').length, 0);
  assert.equal(other.events('signal').length, 0);
});

test('sair e desconectar removem o usuário, avisam os demais e limpam salas vazias', async (t) => {
  const { io, rooms, close } = setup(); t.after(close);
  const [a, b] = ['a', 'b'].map((id) => io.connect(id));
  const { code } = await a.call('room:create', { name: 'A' });
  await b.call('room:join', { name: 'B', code });
  assert.deepEqual((await b.call('room:leave', {})).ok, true);
  assert.deepEqual(a.events('peer:left'), [{ id: 'b' }]);
  assert.equal(rooms.participantCount(code), 1);
  b.fire('signal', { to: 'a', description: { type: 'offer', sdp: '' } });
  assert.equal(a.events('signal').length, 0, 'quem saiu não pode mais sinalizar');
  a.disconnect();
  assert.equal(rooms.roomCount(), 0);
  assert.equal((await io.connect('c').call('room:join', { name: 'C', code })).code, 'ROOM_NOT_FOUND');
});

test('limite de criação/entrada por IP', async (t) => {
  const { io, close } = setup({ roomLimit: 3 }); t.after(close);
  const a = io.connect('a', '9.9.9.9');
  for (let i = 0; i < 3; i += 1) assert.equal((await a.call('room:join', { name: 'A', code: 'ABCDEFGHJK' })).code, 'ROOM_NOT_FOUND');
  assert.equal((await a.call('room:join', { name: 'A', code: 'ABCDEFGHJK' })).code, 'RATE_LIMITED');
  assert.notEqual((await io.connect('z', '8.8.8.8').call('room:join', { name: 'Z', code: 'ABCDEFGHJK' })).code, 'RATE_LIMITED');
});

test('eventos sem ack ou com payload estranho não derrubam o servidor', async (t) => {
  const { io, close } = setup(); t.after(close);
  const a = io.connect('a');
  assert.doesNotThrow(() => a.fire('room:create', { name: 'A' }));
  assert.doesNotThrow(() => a.fire('room:join', 42));
  assert.doesNotThrow(() => a.fire('signal', undefined));
});

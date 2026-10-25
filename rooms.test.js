'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomManager } = require('../lib/rooms');
const { createLimiter } = require('../lib/rateLimit');
const { loadConfig, buildIceServers } = require('../lib/config');

test('criar, entrar e sair; sala vazia é removida', () => {
  const rooms = new RoomManager({ maxParticipants: 3 });
  const { code } = rooms.create({ id: 'a', name: 'Ana' });
  assert.equal(rooms.roomCount(), 1);
  const joined = rooms.join(code, { id: 'b', name: 'Bia' });
  assert.deepEqual(joined.peers, [{ id: 'a', name: 'Ana' }]);
  assert.equal(rooms.participantCount(code), 2);
  assert.equal(rooms.leave(code, 'a'), true);
  assert.equal(rooms.roomCount(), 1);
  assert.equal(rooms.leave(code, 'b'), true);
  assert.equal(rooms.roomCount(), 0);
  assert.equal(rooms.leave(code, 'b'), false);
});

test('rejeita sala inexistente, lotada e entrada duplicada', () => {
  const rooms = new RoomManager({ maxParticipants: 2 });
  assert.equal(rooms.join('ZZZZZZZZZZ', { id: 'a', name: 'A' }).error, 'ROOM_NOT_FOUND');
  const { code } = rooms.create({ id: 'a', name: 'A' });
  assert.equal(rooms.join(code, { id: 'a', name: 'A' }).error, 'ALREADY_IN_ROOM');
  assert.equal(rooms.join(code, { id: 'b', name: 'B' }).ok, true);
  assert.equal(rooms.join(code, { id: 'c', name: 'C' }).error, 'ROOM_FULL');
  assert.equal(rooms.hasPeer(code, 'c'), false);
});

test('limitador bloqueia após o máximo e libera após a janela', async () => {
  const limiter = createLimiter({ windowMs: 50, max: 2 });
  assert.equal(limiter.hit('ip'), true);
  assert.equal(limiter.hit('ip'), true);
  assert.equal(limiter.hit('ip'), false);
  assert.equal(limiter.hit('outro'), true);
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(limiter.hit('ip'), true);
  limiter.close();
});

test('configuração: padrões, limites e TURN só com credenciais completas', () => {
  const c = loadConfig({});
  assert.equal(c.port, 3000);
  assert.equal(c.maxParticipants, 6);
  assert.deepEqual(buildIceServers(c), [{ urls: ['stun:stun.l.google.com:19302'] }]);
  assert.equal(loadConfig({ MAX_PARTICIPANTS: '999' }).maxParticipants, 50);
  assert.equal(loadConfig({ MAX_PARTICIPANTS: 'abc' }).maxParticipants, 6);
  assert.equal(buildIceServers(loadConfig({ TURN_URLS: 'turn:x:3478' })).length, 1);
  const withTurn = buildIceServers(loadConfig({ TURN_URLS: 'turn:x:3478', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' }));
  assert.equal(withTurn.length, 2);
  assert.equal(withTurn[1].username, 'u');
});

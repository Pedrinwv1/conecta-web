'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateRoomCode, normalizeRoomCode, sanitizeName, validateSignal } = require('../lib/validation');

test('códigos de sala gerados são válidos e únicos', () => {
  const codes = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const code = generateRoomCode();
    assert.equal(code.length, 10);
    assert.equal(normalizeRoomCode(code), code);
    codes.add(code);
  }
  assert.equal(codes.size, 2000);
});

test('normalizeRoomCode aceita minúsculas/hífens e rejeita lixo', () => {
  const code = generateRoomCode();
  assert.equal(normalizeRoomCode(` ${code.slice(0, 5).toLowerCase()}-${code.slice(5)} `), code);
  for (const bad of ['', 'abc', '0000000000', 'IIIIIIIIII', null, undefined, 42, {}, 'A'.repeat(500), '<script>']) {
    assert.equal(normalizeRoomCode(bad), null);
  }
});

test('sanitizeName remove HTML/controles e limita tamanho', () => {
  assert.equal(sanitizeName('  Ana   Maria '), 'Ana Maria');
  assert.equal(sanitizeName('<img src=x onerror=alert(1)>'), 'img src=x onerror=alert(1)');
  assert.equal(sanitizeName('a'.repeat(31)), null);
  for (const bad of ['', '   ', '<>', null, 5, {}]) assert.equal(sanitizeName(bad), null);
});

test('validateSignal aceita oferta/resposta/candidato válidos', () => {
  assert.equal(validateSignal({ to: 'x', description: { type: 'offer', sdp: 'v=0' } }).ok, true);
  assert.equal(validateSignal({ to: 'x', description: { type: 'rollback' } }).ok, true);
  assert.equal(validateSignal({ to: 'x', candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } }).ok, true);
  assert.equal(validateSignal({ to: 'x', candidate: { candidate: '' } }).ok, true);
});

test('validateSignal rejeita payloads malformados ou grandes', () => {
  const bad = [
    null, 'texto', [], {}, { to: '' }, { to: 'x' },
    { to: 'x', description: { type: 'offer' }, candidate: { candidate: 'c' } },
    { to: 'x', description: { type: 'hack', sdp: '' } },
    { to: 'x', description: { type: 'offer', sdp: 'a'.repeat(40001) } },
    { to: 'x', description: { type: 'offer', sdp: 123 } },
    { to: 'x', candidate: { candidate: 'a'.repeat(2001) } },
    { to: 'x', candidate: { candidate: 'c', sdpMLineIndex: -1 } },
    { to: 'x', candidate: { candidate: 'c', sdpMid: 5 } },
    { to: 'a'.repeat(65), candidate: { candidate: 'c' } },
  ];
  for (const payload of bad) assert.equal(validateSignal(payload).ok, false, JSON.stringify(payload)?.slice(0, 60));
});

test('validateSignal descarta campos extras (não repassa lixo)', () => {
  const r = validateSignal({ to: 'x', evil: '<script>', description: { type: 'offer', sdp: 'v=0', extra: 1 } });
  assert.deepEqual(r.value, { to: 'x', description: { type: 'offer', sdp: 'v=0' } });
});

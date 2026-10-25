'use strict';
const { normalizeRoomCode, sanitizeName, validateSignal } = require('./validation');

const MESSAGES = {
  RATE_LIMITED: 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.',
  INVALID_NAME: 'Informe um nome com 1 a 30 caracteres.',
  INVALID_CODE: 'Código de sala inválido. Confira o código e tente novamente.',
  ROOM_NOT_FOUND: 'Sala inexistente ou encerrada.',
  ROOM_FULL: 'Esta sala está lotada.',
  ALREADY_IN_ROOM: 'Você já está em uma sala. Saia dela antes de entrar em outra.',
  INTERNAL: 'Erro interno do servidor. Tente novamente em instantes.',
};

const fail = (code) => ({ ok: false, code, message: MESSAGES[code] ?? MESSAGES.INTERNAL });

function clientIp(socket, trustProxy) {
  const forwarded = trustProxy ? socket.handshake?.headers?.['x-forwarded-for'] : null;
  const first = forwarded ? String(forwarded).split(',')[0].trim() : '';
  return first || socket.handshake?.address || 'desconhecido';
}

function registerSignaling(io, { rooms, limiters, trustProxy = false, logger = console }) {
  io.on('connection', (socket) => {
    let current = null; // { code, name } — única fonte de verdade sobre a sala do socket
    const ip = clientIp(socket, trustProxy);

    const leaveCurrent = () => {
      if (!current) return;
      const { code } = current;
      current = null;
      socket.leave(code);
      rooms.leave(code, socket.id);
      socket.to(code).emit('peer:left', { id: socket.id });
    };

    const enter = (result, name, reply) => {
      if (!result.ok) return reply(fail(result.error));
      socket.join(result.code);
      current = { code: result.code, name };
      socket.to(result.code).emit('peer:joined', { id: socket.id, name });
      return reply({ ok: true, code: result.code, id: socket.id, peers: result.peers, maxParticipants: rooms.maxParticipants });
    };

    const handler = (fn) => (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        fn(payload, reply);
      } catch (err) {
        logger.error('Erro no manipulador Socket.IO:', err);
        reply(fail('INTERNAL'));
      }
    };

    socket.on('room:create', handler((payload, reply) => {
      if (!limiters.room.hit(ip)) return reply(fail('RATE_LIMITED'));
      if (current) return reply(fail('ALREADY_IN_ROOM'));
      const name = sanitizeName(payload?.name);
      if (!name) return reply(fail('INVALID_NAME'));
      return enter(rooms.create({ id: socket.id, name }), name, reply);
    }));

    socket.on('room:join', handler((payload, reply) => {
      if (!limiters.room.hit(ip)) return reply(fail('RATE_LIMITED'));
      if (current) return reply(fail('ALREADY_IN_ROOM'));
      const name = sanitizeName(payload?.name);
      if (!name) return reply(fail('INVALID_NAME'));
      const code = normalizeRoomCode(payload?.code);
      if (!code) return reply(fail('INVALID_CODE'));
      return enter(rooms.join(code, { id: socket.id, name }), name, reply);
    }));

    socket.on('room:leave', handler((payload, reply) => {
      leaveCurrent();
      reply({ ok: true });
    }));

    socket.on('signal', handler((payload) => {
      if (!current) return; // quem não está em sala não envia nada
      if (!limiters.signal.hit(socket.id)) return;
      const parsed = validateSignal(payload);
      if (!parsed.ok) return;
      const { to, ...content } = parsed.value;
      if (to === socket.id || !rooms.hasPeer(current.code, to)) return; // destino precisa estar na MESMA sala
      io.to(to).emit('signal', { from: socket.id, ...content });
    }));

    socket.on('disconnect', () => {
      leaveCurrent();
      limiters.signal.delete(socket.id);
    });
  });
}

module.exports = { registerSignaling, MESSAGES };

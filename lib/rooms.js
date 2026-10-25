'use strict';
const { generateRoomCode } = require('./validation');

class RoomManager {
  constructor({ maxParticipants = 6 } = {}) {
    this.maxParticipants = maxParticipants;
    this.rooms = new Map();
  }

  create(peer) {
    let code;
    do { code = generateRoomCode(); } while (this.rooms.has(code));
    this.rooms.set(code, { code, createdAt: Date.now(), peers: new Map([[peer.id, { id: peer.id, name: peer.name }]]) });
    return { ok: true, code, peers: [] };
  }

  join(code, peer) {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (room.peers.has(peer.id)) return { ok: false, error: 'ALREADY_IN_ROOM' };
    if (room.peers.size >= this.maxParticipants) return { ok: false, error: 'ROOM_FULL' };
    const others = [...room.peers.values()].map(({ id, name }) => ({ id, name }));
    room.peers.set(peer.id, { id: peer.id, name: peer.name });
    return { ok: true, code, peers: others };
  }

  leave(code, id) {
    const room = this.rooms.get(code);
    if (!room) return false;
    const removed = room.peers.delete(id);
    if (room.peers.size === 0) this.rooms.delete(code); // sala vazia é encerrada
    return removed;
  }

  hasPeer(code, id) {
    return this.rooms.get(code)?.peers.has(id) === true;
  }

  roomCount() { return this.rooms.size; }
  participantCount(code) { return this.rooms.get(code)?.peers.size ?? 0; }
}

module.exports = { RoomManager };

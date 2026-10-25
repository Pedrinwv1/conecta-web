'use strict';
const crypto = require('crypto');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 símbolos, sem 0/O/1/I
const CODE_LENGTH = 10; // 32^10 ≈ 2^50 combinações
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
const MAX_SDP_LENGTH = 40000;
const DESCRIPTION_TYPES = new Set(['offer', 'answer', 'pranswer', 'rollback']);

function generateRoomCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte & 31]; // 256 % 32 === 0: sem viés
  return code;
}

function normalizeRoomCode(input) {
  if (typeof input !== 'string' || input.length > 40) return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

function sanitizeName(input) {
  if (typeof input !== 'string') return null;
  const name = input.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= 30 ? name : null;
}

const invalid = () => ({ ok: false });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validateSignal(payload) {
  if (!isPlainObject(payload)) return invalid();
  const { to, description, candidate } = payload;
  if (typeof to !== 'string' || to.length === 0 || to.length > 64) return invalid();
  const hasDescription = description !== undefined && description !== null;
  const hasCandidate = candidate !== undefined && candidate !== null;
  if (hasDescription === hasCandidate) return invalid(); // exatamente um dos dois

  if (hasDescription) {
    if (!isPlainObject(description) || !DESCRIPTION_TYPES.has(description.type)) return invalid();
    const sdp = description.sdp ?? '';
    if (typeof sdp !== 'string' || sdp.length > MAX_SDP_LENGTH) return invalid();
    return { ok: true, value: { to, description: { type: description.type, sdp } } };
  }

  if (!isPlainObject(candidate) || typeof candidate.candidate !== 'string' || candidate.candidate.length > 2000) return invalid();
  const { sdpMid = null, sdpMLineIndex = null, usernameFragment = null } = candidate;
  if (sdpMid !== null && (typeof sdpMid !== 'string' || sdpMid.length > 64)) return invalid();
  if (sdpMLineIndex !== null && !(Number.isInteger(sdpMLineIndex) && sdpMLineIndex >= 0 && sdpMLineIndex <= 64)) return invalid();
  if (usernameFragment !== null && (typeof usernameFragment !== 'string' || usernameFragment.length > 256)) return invalid();
  return { ok: true, value: { to, candidate: { candidate: candidate.candidate, sdpMid, sdpMLineIndex, usernameFragment } } };
}

module.exports = { generateRoomCode, normalizeRoomCode, sanitizeName, validateSignal, CODE_LENGTH };

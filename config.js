'use strict';
try {
  require('dotenv').config();
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
}

function toInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toList(value) {
  return String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function loadConfig(env = process.env) {
  return {
    port: toInt(env.PORT, 3000, 0, 65535),
    maxParticipants: toInt(env.MAX_PARTICIPANTS, 6, 2, 50),
    allowedOrigins: toList(env.ALLOWED_ORIGINS),
    trustProxy: env.TRUST_PROXY === 'true',
    stunUrls: env.STUN_URLS === undefined ? ['stun:stun.l.google.com:19302'] : toList(env.STUN_URLS),
    turnUrls: toList(env.TURN_URLS),
    turnUsername: env.TURN_USERNAME || '',
    turnCredential: env.TURN_CREDENTIAL || '',
    rateLimitMax: toInt(env.RATE_LIMIT_MAX, 20, 1, 1000),
    rateLimitWindowMs: toInt(env.RATE_LIMIT_WINDOW_SECONDS, 60, 1, 3600) * 1000,
  };
}

function buildIceServers(config) {
  const servers = [];
  if (config.stunUrls.length) servers.push({ urls: config.stunUrls });
  if (config.turnUrls.length && config.turnUsername && config.turnCredential) {
    servers.push({ urls: config.turnUrls, username: config.turnUsername, credential: config.turnCredential });
  }
  return servers;
}

module.exports = { loadConfig, buildIceServers };

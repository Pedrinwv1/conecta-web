'use strict';
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { loadConfig, buildIceServers } = require('./lib/config');
const { RoomManager } = require('./lib/rooms');
const { createLimiter } = require('./lib/rateLimit');
const { securityHeaders, corsMiddleware } = require('./lib/security');
const { registerSignaling } = require('./lib/signaling');

function createServer(config = loadConfig()) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(securityHeaders());
  app.use(corsMiddleware(config.allowedOrigins));

  const apiLimiter = createLimiter({ windowMs: 60_000, max: 120 });
  const limiters = {
    room: createLimiter({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMax }),
    signal: createLimiter({ windowMs: 10_000, max: 400 }),
  };
  const rooms = new RoomManager({ maxParticipants: config.maxParticipants });

  app.get('/healthz', (req, res) => res.json({ status: 'ok', rooms: rooms.roomCount() }));
  app.get('/api/config', (req, res) => {
    if (!apiLimiter.hit(req.ip)) return res.status(429).json({ error: 'Muitas requisições. Aguarde um momento.' });
    res.set('Cache-Control', 'no-store');
    return res.json({ iceServers: buildIceServers(config), maxParticipants: config.maxParticipants });
  });
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso não encontrado.' }));
  app.use((req, res) => res.status(404).type('text/plain; charset=utf-8').send('Página não encontrada.'));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Erro HTTP:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 64 * 1024,
    cors: config.allowedOrigins.length ? { origin: config.allowedOrigins } : undefined,
  });
  registerSignaling(io, { rooms, limiters, trustProxy: config.trustProxy });

  return {
    app, httpServer, io, rooms, config,
    start(port = config.port) {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => {
          httpServer.off('error', reject);
          resolve(httpServer.address());
        });
      });
    },
    stop() {
      apiLimiter.close();
      limiters.room.close();
      limiters.signal.close();
      return new Promise((resolve) => io.close(() => resolve()));
    },
  };
}

module.exports = { createServer };

if (require.main === module) {
  const server = createServer();
  server.start().then((addr) => {
    console.log(`Conecta Web em execução: http://localhost:${addr.port}`);
    console.log('Para parar o servidor, pressione Ctrl+C.');
  }).catch((err) => {
    console.error(err.code === 'EADDRINUSE'
      ? `A porta ${server.config.port} já está em uso. Feche a outra janela do Conecta Web ou altere PORT no arquivo .env.`
      : `Falha ao iniciar o servidor: ${err.message}`);
    process.exit(1);
  });
  const shutdown = () => server.stop().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

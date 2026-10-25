'use strict';

function createLimiter({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, Math.max(1000, windowMs));
  timer.unref();

  return {
    /** Retorna true se a requisição está dentro do limite. */
    hit(key) {
      const now = Date.now();
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return entry.count <= max;
    },
    delete(key) { hits.delete(key); },
    size() { return hits.size; },
    close() { clearInterval(timer); hits.clear(); },
  };
}

module.exports = { createLimiter };

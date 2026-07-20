const logger = require('../utils/logger');

// Alguns dispositivos de hardware (ex.: catraca Control iD) não conseguem
// enviar headers customizados, então o segredo do webhook vai embutido no
// path da URL — isso não pode vazar pro log estruturado de toda requisição.
function redigirSegredoNoPath(path) {
  return path.replace(/(\/api\/notifications\/catraca\/)[^/]+/, '$1[REDACTED]');
}

// Loga toda requisição em JSON estruturado: método, rota, status e duração —
// base pras métricas de p50/p95/p99 até termos um coletor central (ex: Datadog).
function requestLogger(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const duracaoMs = Number(process.hrtime.bigint() - inicio) / 1e6;
    logger.info('http_request', {
      requestId: req.requestId,
      method: req.method,
      path: redigirSegredoNoPath(req.originalUrl),
      statusCode: res.statusCode,
      durationMs: Math.round(duracaoMs * 100) / 100,
    });
  });
  next();
}

module.exports = requestLogger;

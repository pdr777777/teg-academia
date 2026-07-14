const logger = require('../utils/logger');

// Loga toda requisição em JSON estruturado: método, rota, status e duração —
// base pras métricas de p50/p95/p99 até termos um coletor central (ex: Datadog).
function requestLogger(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const duracaoMs = Number(process.hrtime.bigint() - inicio) / 1e6;
    logger.info('http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(duracaoMs * 100) / 100,
    });
  });
  next();
}

module.exports = requestLogger;

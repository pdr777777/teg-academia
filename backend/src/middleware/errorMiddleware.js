const logger = require('../utils/logger');

function errorMiddleware(err, req, res, next) {
  logger.error(err.message, {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    stack: err.stack,
  });

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Registro duplicado', requestId: req.requestId });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referência inválida', requestId: req.requestId });
  }

  res.status(500).json({ error: 'Erro interno do servidor', requestId: req.requestId });
}

module.exports = errorMiddleware;

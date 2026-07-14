const crypto = require('crypto');

// Todo request ganha um X-Request-ID (aceita o do cliente/proxy se já vier
// setado) — propagado no header de resposta e em todo log/erro dessa requisição.
function requestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

module.exports = requestId;

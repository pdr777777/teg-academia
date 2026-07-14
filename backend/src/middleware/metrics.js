const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register }); // heap, CPU, event loop lag etc.

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos (base para p50/p95/p99)',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

function metricsMiddleware(req, res, next) {
  const fimTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    fimTimer({
      method: req.method,
      route: req.route ? `${req.baseUrl}${req.route.path}` : req.path,
      status_code: res.statusCode,
    });
  });
  next();
}

module.exports = { register, metricsMiddleware };

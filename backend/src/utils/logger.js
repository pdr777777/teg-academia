// Logger JSON estruturado: { level, timestamp, message, ...context }, sem texto livre.
// Sem dependência externa (winston/pino) — volume do projeto não justifica ainda.
function log(level, message, context = {}) {
  const linha = JSON.stringify({ level, timestamp: new Date().toISOString(), message, ...context });
  if (level === 'error' || level === 'warn') {
    console.error(linha);
  } else {
    console.log(linha);
  }
}

module.exports = {
  info: (message, context) => log('info', message, context),
  warn: (message, context) => log('warn', message, context),
  error: (message, context) => log('error', message, context),
};

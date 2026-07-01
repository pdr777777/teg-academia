function errorMiddleware(err, req, res, next) {
  console.error(err);

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Registro duplicado' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referência inválida' });
  }

  res.status(500).json({ error: 'Erro interno do servidor' });
}

module.exports = errorMiddleware;

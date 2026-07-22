const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Só valida um campo quando ele veio no corpo — o PUT usa COALESCE pra
// permitir atualização parcial, então `undefined` (campo não enviado) tem
// que passar direto, só valor inválido enviado de propósito é rejeitado.
function erroDeValidacaoPlano(body) {
  if (body.nome !== undefined && (typeof body.nome !== 'string' || !body.nome.trim())) {
    return 'nome não pode ser vazio';
  }
  if (body.preco_mensal !== undefined && !(Number(body.preco_mensal) > 0)) {
    return 'preco_mensal deve ser um número maior que zero';
  }
  if (body.duracao_dias !== undefined && !(Number.isInteger(body.duracao_dias) && body.duracao_dias > 0)) {
    return 'duracao_dias deve ser um número inteiro maior que zero';
  }
  return null;
}

// GET /api/planos (público — usado na matrícula online)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM planos WHERE ativo = TRUE ORDER BY preco_mensal');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/planos (admin/dono)
router.post('/', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { nome, descricao, preco_mensal, duracao_dias } = req.body;
    if (!nome || !preco_mensal) return res.status(400).json({ error: 'nome e preco_mensal são obrigatórios' });
    const erro = erroDeValidacaoPlano(req.body);
    if (erro) return res.status(400).json({ error: erro });

    const { rows } = await pool.query(
      'INSERT INTO planos (nome, descricao, preco_mensal, duracao_dias) VALUES ($1, $2, $3, $4) RETURNING *',
      [nome, descricao, preco_mensal, duracao_dias || 30]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/planos/:id (admin/dono)
router.put('/:id', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { nome, descricao, preco_mensal, duracao_dias, ativo } = req.body;
    const erro = erroDeValidacaoPlano(req.body);
    if (erro) return res.status(400).json({ error: erro });

    const { rows } = await pool.query(
      `UPDATE planos SET nome = COALESCE($1, nome), descricao = COALESCE($2, descricao),
       preco_mensal = COALESCE($3, preco_mensal), duracao_dias = COALESCE($4, duracao_dias),
       ativo = COALESCE($5, ativo) WHERE id = $6 RETURNING *`,
      [nome, descricao, preco_mensal, duracao_dias, ativo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plano não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

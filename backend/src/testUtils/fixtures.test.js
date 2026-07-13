const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('./fixtures');

describe('fixtures de teste', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('criarUsuario insere um aluno ativo e retorna a linha', async () => {
    const user = await criarUsuario({ role: 'aluno' });
    expect(user.id).toBeDefined();
    expect(user.role).toBe('aluno');
    expect(user.ativo).toBe(true);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [user.id]);
  });

  test('criarPlano insere um plano ativo', async () => {
    const plano = await criarPlano({ preco_mensal: 99.9, duracao_dias: 30 });
    expect(plano.preco_mensal).toBe('99.90');
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });

  test('criarMatricula vincula usuario e plano', async () => {
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({ usuario_id: user.id, plano_id: plano.id, status: 'ativa' });
    expect(matricula.usuario_id).toBe(user.id);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [user.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });

  test('gerarToken produz um JWT decodificável', () => {
    const token = gerarToken({ id: 42, role: 'aluno', senha_alterada_em: null });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });
});

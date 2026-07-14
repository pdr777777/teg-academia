const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const {
  criarUsuario, criarExercicio, criarTreino, criarTreinoExercicio, atribuirTreino, gerarToken,
} = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

describe('GET /api/treinos/meu', () => {
  test('retorna o treino ativo do aluno com exercícios agregados', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const exercicio = await criarExercicio({ nome: 'Supino Teste' });
    const treino = await criarTreino({ nome: 'Treino A Teste' });
    await criarTreinoExercicio({ treino_id: treino.id, exercicio_id: exercicio.id, series: 4 });
    await atribuirTreino(treino.id, aluno.id);

    const res = await request(app)
      .get('/api/treinos/meu')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].exercicios[0].exercicio.nome).toBe('Supino Teste');

    await pool.query('DELETE FROM treino_alunos WHERE treino_id = $1', [treino.id]);
    await pool.query('DELETE FROM treino_exercicios WHERE treino_id = $1', [treino.id]);
    await pool.query('DELETE FROM treinos WHERE id = $1', [treino.id]);
    await pool.query('DELETE FROM exercicios WHERE id = $1', [exercicio.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('retorna lista vazia quando o aluno não tem treino atribuído', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get('/api/treinos/meu')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});

describe('GET /api/treinos (professor/admin)', () => {
  test('rejeita aluno comum', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get('/api/treinos')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(403);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('professor lista todos os treinos com contagem de exercícios', async () => {
    const professor = await criarUsuario({ role: 'professor' });
    const treino = await criarTreino({ nome: 'Treino Lista Teste', professor_id: professor.id });

    const res = await request(app)
      .get('/api/treinos')
      .set('Authorization', `Bearer ${gerarToken(professor)}`);
    expect(res.status).toBe(200);
    const encontrado = res.body.find((t) => t.id === treino.id);
    expect(encontrado).toBeDefined();
    expect(encontrado.exercicios_count).toBe(0);

    await pool.query('DELETE FROM treinos WHERE id = $1', [treino.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [professor.id]);
  });
});

describe('POST /api/treinos e /:id/atribuir/:usuarioId', () => {
  test('professor cria treino com exercícios e atribui a um aluno (substituindo o anterior)', async () => {
    const professor = await criarUsuario({ role: 'professor' });
    const aluno = await criarUsuario({ role: 'aluno' });
    const exercicio = await criarExercicio({ nome: 'Agachamento Teste' });

    const criacao = await request(app)
      .post('/api/treinos')
      .set('Authorization', `Bearer ${gerarToken(professor)}`)
      .send({
        nome: 'Treino Criado Teste',
        descricao: 'Foco em pernas',
        exercicios: [{ exercicio_id: exercicio.id, series: 4, repeticoes: '10', carga: '40kg', descanso_segundos: 90 }],
      });
    expect(criacao.status).toBe(201);
    const treinoId = criacao.body.id;

    const { rows: treinoExercicios } = await pool.query(
      'SELECT * FROM treino_exercicios WHERE treino_id = $1', [treinoId]
    );
    expect(treinoExercicios).toHaveLength(1);
    expect(treinoExercicios[0].series).toBe(4);

    const atribuicao1 = await request(app)
      .post(`/api/treinos/${treinoId}/atribuir/${aluno.id}`)
      .set('Authorization', `Bearer ${gerarToken(professor)}`);
    expect(atribuicao1.status).toBe(200);

    const outroTreino = await criarTreino({ nome: 'Segundo Treino Teste', professor_id: professor.id });
    const atribuicao2 = await request(app)
      .post(`/api/treinos/${outroTreino.id}/atribuir/${aluno.id}`)
      .set('Authorization', `Bearer ${gerarToken(professor)}`);
    expect(atribuicao2.status).toBe(200);

    const { rows: ativos } = await pool.query(
      'SELECT treino_id FROM treino_alunos WHERE usuario_id = $1 AND ativo = TRUE', [aluno.id]
    );
    expect(ativos).toHaveLength(1);
    expect(ativos[0].treino_id).toBe(outroTreino.id);

    await pool.query('DELETE FROM treino_alunos WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM treino_exercicios WHERE treino_id = ANY($1)', [[treinoId, outroTreino.id]]);
    await pool.query('DELETE FROM treinos WHERE id = ANY($1)', [[treinoId, outroTreino.id]]);
    await pool.query('DELETE FROM exercicios WHERE id = $1', [exercicio.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[professor.id, aluno.id]]);
  });
});

describe('GET /api/treinos/exercicios', () => {
  test('lista biblioteca de exercícios, com filtro por grupo muscular', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const peito = await criarExercicio({ nome: 'Supino Reto Teste', grupo_muscular: 'peito' });
    const costas = await criarExercicio({ nome: 'Remada Teste', grupo_muscular: 'costas' });

    const semFiltro = await request(app)
      .get('/api/treinos/exercicios')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(semFiltro.status).toBe(200);
    expect(semFiltro.body.some((e) => e.id === peito.id)).toBe(true);

    const comFiltro = await request(app)
      .get('/api/treinos/exercicios?grupo=peito')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(comFiltro.status).toBe(200);
    expect(comFiltro.body.some((e) => e.id === peito.id)).toBe(true);
    expect(comFiltro.body.some((e) => e.id === costas.id)).toBe(false);

    await pool.query('DELETE FROM exercicios WHERE id = ANY($1)', [[peito.id, costas.id]]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});

describe('POST /api/treinos/exercicios e PUT /api/treinos/exercicios/:id', () => {
  test('rejeita aluno comum e valida nome obrigatório', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const professor = await criarUsuario({ role: 'professor' });

    const semPermissao = await request(app)
      .post('/api/treinos/exercicios')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ nome: 'Supino Teste' });
    expect(semPermissao.status).toBe(403);

    const semNome = await request(app)
      .post('/api/treinos/exercicios')
      .set('Authorization', `Bearer ${gerarToken(professor)}`)
      .send({ grupo_muscular: 'peito' });
    expect(semNome.status).toBe(400);

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[aluno.id, professor.id]]);
  });

  test('professor cadastra exercício com imagem/vídeo e depois edita', async () => {
    const professor = await criarUsuario({ role: 'professor' });

    const criacao = await request(app)
      .post('/api/treinos/exercicios')
      .set('Authorization', `Bearer ${gerarToken(professor)}`)
      .send({
        nome: 'Supino Reto Teste',
        grupo_muscular: 'peito',
        video_url: 'https://exemplo.com/video.mp4',
        imagem_url: 'https://exemplo.com/imagem.jpg',
      });
    expect(criacao.status).toBe(201);
    expect(criacao.body.imagem_url).toBe('https://exemplo.com/imagem.jpg');

    const edicao = await request(app)
      .put(`/api/treinos/exercicios/${criacao.body.id}`)
      .set('Authorization', `Bearer ${gerarToken(professor)}`)
      .send({ nome: 'Supino Reto Atualizado', imagem_url: 'https://exemplo.com/nova.jpg' });
    expect(edicao.status).toBe(200);
    expect(edicao.body.nome).toBe('Supino Reto Atualizado');
    expect(edicao.body.imagem_url).toBe('https://exemplo.com/nova.jpg');

    const inexistente = await request(app)
      .put('/api/treinos/exercicios/999999999')
      .set('Authorization', `Bearer ${gerarToken(professor)}`)
      .send({ nome: 'X' });
    expect(inexistente.status).toBe(404);

    await pool.query('DELETE FROM exercicios WHERE id = $1', [criacao.body.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [professor.id]);
  });
});

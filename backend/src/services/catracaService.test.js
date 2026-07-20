jest.mock('./catraca/config');
const { catracasConfiguradas } = require('./catraca/config');
const pool = require('../config/db');
const { criarUsuario } = require('../testUtils/fixtures');
const catracaService = require('./catracaService');

function clienteFalso() {
  return {
    nome: 'catraca1',
    loadObjects: jest.fn().mockResolvedValue([]),
    createObjects: jest.fn().mockResolvedValue([999]),
    destroyObjects: jest.fn().mockResolvedValue(1),
    setUserImage: jest.fn().mockResolvedValue(undefined),
    login: jest.fn().mockResolvedValue(undefined),
  };
}

describe('garantirEstruturaBase', () => {
  test('cria grupo, regra, horário e vínculos quando nada existe ainda', async () => {
    const client = clienteFalso();
    // loadObjects sempre vazio → tudo é criado do zero
    const grupoId = await catracaService.garantirEstruturaBase(client);

    expect(grupoId).toBe(999);
    const chamadasCreate = client.createObjects.mock.calls.map((c) => c[0]);
    expect(chamadasCreate).toEqual(expect.arrayContaining([
      'groups', 'access_rules', 'time_zones', 'time_spans', 'access_rule_time_zones', 'group_access_rules',
    ]));
  });

  test('não recria nada quando grupo/regra/horário já existem', async () => {
    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => {
      if (object === 'groups') return [{ id: 1, name: 'TEG-ativos' }];
      if (object === 'access_rules') return [{ id: 2, name: 'TEG-liberado' }];
      if (object === 'time_zones') return [{ id: 3, name: 'TEG-sempre' }];
      if (object === 'access_rule_time_zones') return [{ access_rule_id: 2, time_zone_id: 3 }];
      if (object === 'group_access_rules') return [{ group_id: 1, access_rule_id: 2 }];
      if (object === 'portals') return [];
      return [];
    });

    const grupoId = await catracaService.garantirEstruturaBase(client);
    expect(grupoId).toBe(1);
    expect(client.createObjects).not.toHaveBeenCalled();
  });
});

describe('sincronizarAluno', () => {
  async function limpar(usuarioId) {
    await pool.query('DELETE FROM catraca_usuarios WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  }

  test('cria usuário na catraca com registration TEG-<id> e guarda o mapeamento', async () => {
    const client = clienteFalso();
    catracasConfiguradas.mockReturnValue([client]);
    const aluno = await criarUsuario({ nome: 'Aluno Catraca' });

    await catracaService.sincronizarAluno(aluno.id);

    const criarUsuarioChamada = client.createObjects.mock.calls.find((c) => c[0] === 'users');
    expect(criarUsuarioChamada[1][0].registration).toBe(`TEG-${aluno.id}`);

    const { rows: [mapeamento] } = await pool.query(
      'SELECT * FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2', [aluno.id, 'catraca1']
    );
    expect(mapeamento.catraca_user_id).toBe(999);
    expect(mapeamento.face_status).toBe('pendente_presencial');

    await limpar(aluno.id);
  });

  test('é idempotente — não cria usuário de novo se já existe mapeamento', async () => {
    const client = clienteFalso();
    catracasConfiguradas.mockReturnValue([client]);
    const aluno = await criarUsuario({ nome: 'Aluno Catraca 2' });

    await catracaService.sincronizarAluno(aluno.id);
    client.createObjects.mockClear();
    await catracaService.sincronizarAluno(aluno.id);

    const criouUsuarioDeNovo = client.createObjects.mock.calls.some((c) => c[0] === 'users');
    expect(criouUsuarioDeNovo).toBe(false);

    await limpar(aluno.id);
  });

  test('marca face_status como erro quando o envio da foto falha', async () => {
    const client = clienteFalso();
    client.setUserImage = jest.fn().mockRejectedValue(new Error('foto inválida'));
    catracasConfiguradas.mockReturnValue([client]);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

    const aluno = await criarUsuario({ nome: 'Aluno Sem Foto Boa', foto_url: 'https://exemplo.com/foto.jpg' });
    await pool.query('UPDATE usuarios SET foto_url = $1 WHERE id = $2', ['https://exemplo.com/foto.jpg', aluno.id]);

    await catracaService.sincronizarAluno(aluno.id);

    const { rows: [mapeamento] } = await pool.query(
      'SELECT face_status FROM catraca_usuarios WHERE usuario_id = $1', [aluno.id]
    );
    expect(mapeamento.face_status).toBe('pendente_presencial');

    await limpar(aluno.id);
  });
});

describe('liberarAcesso / bloquearAcesso', () => {
  async function limpar(usuarioId) {
    await pool.query('DELETE FROM catraca_usuarios WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  }

  test('liberarAcesso vincula o usuário ao grupo TEG-ativos e marca grupo_ativo', async () => {
    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => (object === 'groups' ? [{ id: 1, name: 'TEG-ativos' }] : []));
    catracasConfiguradas.mockReturnValue([client]);

    const aluno = await criarUsuario({ nome: 'Aluno Liberar' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id) VALUES ($1, 'catraca1', 555)`,
      [aluno.id]
    );

    await catracaService.liberarAcesso(aluno.id);

    const vinculoCriado = client.createObjects.mock.calls.find((c) => c[0] === 'user_groups');
    expect(vinculoCriado[1][0]).toEqual({ user_id: 555, group_id: 1 });

    const { rows: [mapeamento] } = await pool.query('SELECT grupo_ativo FROM catraca_usuarios WHERE usuario_id = $1', [aluno.id]);
    expect(mapeamento.grupo_ativo).toBe(true);

    await limpar(aluno.id);
  });

  test('bloquearAcesso remove o vínculo e marca grupo_ativo como falso', async () => {
    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => (object === 'groups' ? [{ id: 1, name: 'TEG-ativos' }] : []));
    catracasConfiguradas.mockReturnValue([client]);

    const aluno = await criarUsuario({ nome: 'Aluno Bloquear' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id, grupo_ativo) VALUES ($1, 'catraca1', 556, TRUE)`,
      [aluno.id]
    );

    await catracaService.bloquearAcesso(aluno.id);

    expect(client.destroyObjects).toHaveBeenCalledWith('user_groups', { user_id: 556, group_id: 1 });

    const { rows: [mapeamento] } = await pool.query('SELECT grupo_ativo FROM catraca_usuarios WHERE usuario_id = $1', [aluno.id]);
    expect(mapeamento.grupo_ativo).toBe(false);

    await limpar(aluno.id);
  });

  test('não faz nada quando o aluno ainda não foi sincronizado nessa catraca', async () => {
    const client = clienteFalso();
    catracasConfiguradas.mockReturnValue([client]);
    const aluno = await criarUsuario({ nome: 'Aluno Nunca Sincronizado' });

    await catracaService.bloquearAcesso(aluno.id);
    expect(client.destroyObjects).not.toHaveBeenCalled();

    await limpar(aluno.id);
  });
});

jest.mock('./sessaoService');
jest.mock('./frequenciaService');
const sessaoService = require('./sessaoService');
const frequenciaService = require('./frequenciaService');

describe('processarNovosAcessos', () => {
  async function limpar(usuarioId) {
    await pool.query('DELETE FROM catraca_eventos WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM catraca_cursor WHERE catraca = $1', ['catraca1']);
    await pool.query('DELETE FROM catraca_usuarios WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  }

  beforeEach(() => {
    sessaoService.iniciarSessao.mockReset();
    frequenciaService.registrarCheckin.mockReset();
  });

  test('evento autorizado de usuário TEG gera sessão + check-in e avança o cursor', async () => {
    const aluno = await criarUsuario({ nome: 'Aluno Evento' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id) VALUES ($1, 'catraca1', 777)`,
      [aluno.id]
    );
    sessaoService.iniciarSessao.mockResolvedValue({ id: 1 });
    frequenciaService.registrarCheckin.mockResolvedValue({ id: 1 });

    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => {
      if (object === 'access_logs') return [{ id: 10, time: Math.floor(Date.now() / 1000), event: 7, user_id: 777 }];
      return [];
    });
    catracasConfiguradas.mockReturnValue([client]);

    await catracaService.processarNovosAcessos();

    expect(sessaoService.iniciarSessao).toHaveBeenCalledWith(aluno.id, null, 'catraca');
    expect(frequenciaService.registrarCheckin).toHaveBeenCalledWith(aluno.id, 'catraca');

    const { rows: [evento] } = await pool.query('SELECT * FROM catraca_eventos WHERE usuario_id = $1', [aluno.id]);
    expect(evento.tipo).toBe('autorizado');

    const { rows: [cursor] } = await pool.query('SELECT ultimo_evento_id FROM catraca_cursor WHERE catraca = $1', ['catraca1']);
    expect(cursor.ultimo_evento_id).toBe(10);

    await limpar(aluno.id);
  });

  test('não quebra quando o aluno não tem treino atribuído (iniciarSessao rejeita)', async () => {
    const aluno = await criarUsuario({ nome: 'Aluno Sem Treino Catraca' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id) VALUES ($1, 'catraca1', 778)`,
      [aluno.id]
    );
    const semTreino = new Error('Aluno não tem treino atribuído');
    semTreino.status = 400;
    sessaoService.iniciarSessao.mockRejectedValue(semTreino);
    frequenciaService.registrarCheckin.mockResolvedValue({ id: 2 });

    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => {
      if (object === 'access_logs') return [{ id: 11, time: Math.floor(Date.now() / 1000), event: 7, user_id: 778 }];
      return [];
    });
    catracasConfiguradas.mockReturnValue([client]);

    await expect(catracaService.processarNovosAcessos()).resolves.not.toThrow();
    expect(frequenciaService.registrarCheckin).toHaveBeenCalledWith(aluno.id, 'catraca');

    await limpar(aluno.id);
  });

  test('evento de usuário não reconhecido pelo TEG só vira telemetria, sem chamar sessão/frequência', async () => {
    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => {
      if (object === 'access_logs') return [{ id: 12, time: Math.floor(Date.now() / 1000), event: 7, user_id: 999999 }];
      return [];
    });
    catracasConfiguradas.mockReturnValue([client]);

    await catracaService.processarNovosAcessos();

    expect(sessaoService.iniciarSessao).not.toHaveBeenCalled();
    expect(frequenciaService.registrarCheckin).not.toHaveBeenCalled();

    const { rows: [evento] } = await pool.query(
      `SELECT * FROM catraca_eventos WHERE catraca = 'catraca1' ORDER BY id DESC LIMIT 1`
    );
    expect(evento.usuario_id).toBeNull();

    await pool.query('DELETE FROM catraca_eventos WHERE id = $1', [evento.id]);
    await pool.query('DELETE FROM catraca_cursor WHERE catraca = $1', ['catraca1']);
  });
});

const { criarClienteCatraca, CatracaOfflineError } = require('./controlIdClient');

function respostaOk(json) {
  return { ok: true, status: 200, json: async () => json };
}

describe('criarClienteCatraca', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  function novoCliente() {
    return criarClienteCatraca({ nome: 'catraca1', host: '192.168.100.129', porta: '80', usuario: 'admin', senha: 'admin' });
  }

  test('loga automaticamente na primeira chamada e reaproveita a sessão', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaOk({ session: 'sess-123' }))
      .mockResolvedValueOnce(respostaOk({ users: [{ id: 1, name: 'Fulano' }] }))
      .mockResolvedValueOnce(respostaOk({ users: [] }));

    const client = novoCliente();
    const usuarios = await client.loadObjects('users', { fields: ['id', 'name'] });

    expect(usuarios).toEqual([{ id: 1, name: 'Fulano' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0].toString()).toContain('/login.fcgi');
    expect(fetchMock.mock.calls[1][0].toString()).toContain('session=sess-123');

    await client.loadObjects('users', { fields: ['id'] });
    expect(fetchMock).toHaveBeenCalledTimes(3); // não logou de novo
  });

  test('createObjects retorna os ids criados', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaOk({ session: 'sess-123' }))
      .mockResolvedValueOnce(respostaOk({ ids: [42] }));

    const client = novoCliente();
    const ids = await client.createObjects('users', [{ registration: 'TEG-1', name: 'Fulano', password: 'x' }]);
    expect(ids).toEqual([42]);
  });

  test('destroyObjects retorna a quantidade de linhas removidas', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaOk({ session: 'sess-123' }))
      .mockResolvedValueOnce(respostaOk({ changes: 1 }));

    const client = novoCliente();
    const changes = await client.destroyObjects('user_groups', { user_id: 1, group_id: 2 });
    expect(changes).toBe(1);
  });

  test('reautentica uma vez quando a sessão expira (401) e repete a chamada', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaOk({ session: 'sess-velha' }))
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce(respostaOk({ session: 'sess-nova' }))
      .mockResolvedValueOnce(respostaOk({ users: [] }));

    const client = novoCliente();
    const usuarios = await client.loadObjects('users', { fields: ['id'] });
    expect(usuarios).toEqual([]);
    expect(fetchMock.mock.calls[3][0].toString()).toContain('session=sess-nova');
  });

  test('lança CatracaOfflineError quando a rede falha', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const client = novoCliente();
    await expect(client.loadObjects('users', { fields: ['id'] })).rejects.toThrow(CatracaOfflineError);
  });
});

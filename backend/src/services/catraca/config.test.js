describe('catracasConfiguradas', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('retorna uma catraca por dispositivo configurado, ignorando os que não têm HOST', () => {
    process.env.CATRACA1_HOST = '192.168.100.129';
    process.env.CATRACA1_PORT = '80';
    process.env.CATRACA1_USER = 'admin';
    process.env.CATRACA1_PASSWORD = 'admin';
    delete process.env.CATRACA2_HOST;

    const { catracasConfiguradas } = require('./config');
    const clientes = catracasConfiguradas();

    expect(clientes).toHaveLength(1);
    expect(clientes[0].nome).toBe('catraca1');
  });

  test('retorna as duas catracas quando as duas estão configuradas', () => {
    process.env.CATRACA1_HOST = '192.168.100.129';
    process.env.CATRACA1_USER = 'admin';
    process.env.CATRACA1_PASSWORD = 'admin';
    process.env.CATRACA2_HOST = '192.168.100.130';
    process.env.CATRACA2_USER = 'admin';
    process.env.CATRACA2_PASSWORD = 'admin';

    const { catracasConfiguradas } = require('./config');
    expect(catracasConfiguradas().map((c) => c.nome)).toEqual(['catraca1', 'catraca2']);
  });

  test('retorna array vazio quando nenhuma catraca está configurada', () => {
    delete process.env.CATRACA1_HOST;
    delete process.env.CATRACA2_HOST;
    const { catracasConfiguradas } = require('./config');
    expect(catracasConfiguradas()).toEqual([]);
  });
});

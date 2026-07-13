const whatsappService = require('./whatsappService');

describe('whatsappService — cobrança e atraso', () => {
  let consoleSpy;
  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('enviarCobrancaGerada inclui o link quando fornecido', async () => {
    await whatsappService.enviarCobrancaGerada('67999999999', 'Maria', 'https://pay.example.com/abc');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('https://pay.example.com/abc'));
  });

  test('enviarCobrancaGerada avisa pra procurar a recepção quando não há link', async () => {
    await whatsappService.enviarCobrancaGerada('67999999999', 'Maria', null);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('recepção'));
  });

  test('enviarLembreteAtraso menciona os dias de atraso', async () => {
    await whatsappService.enviarLembreteAtraso('67999999999', 'Maria', 3);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3 dia'));
  });
});

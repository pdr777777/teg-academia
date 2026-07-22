const whatsappService = require('./whatsappService');

describe('whatsappService — cobrança e atraso', () => {
  let consoleSpy;
  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('enviarCobrancaGerada usa o template com link quando fornecido', async () => {
    await whatsappService.enviarCobrancaGerada('67999999999', 'Maria', 'https://pay.example.com/abc');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(whatsappService.TEMPLATES.COBRANCA_COM_LINK));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('https://pay.example.com/abc'));
  });

  test('enviarCobrancaGerada usa o template de recepção quando não há link', async () => {
    await whatsappService.enviarCobrancaGerada('67999999999', 'Maria', null);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(whatsappService.TEMPLATES.COBRANCA_SEM_LINK));
  });

  test('enviarLembreteAtraso manda os dias de atraso como parâmetro do template', async () => {
    await whatsappService.enviarLembreteAtraso('67999999999', 'Maria', 3);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(whatsappService.TEMPLATES.LEMBRETE_ATRASO));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"3"'));
  });
});

describe('whatsappService — demais notificações usam template, não texto livre', () => {
  let consoleSpy;
  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('enviarBoasVindas usa o template correto com nome e plano', async () => {
    await whatsappService.enviarBoasVindas('67999999999', 'Maria', 'Mensal');
    const [msg] = consoleSpy.mock.calls[0];
    expect(msg).toContain(whatsappService.TEMPLATES.BOAS_VINDAS);
    expect(msg).toContain('"type":"template"');
    expect(msg).toContain('Maria');
    expect(msg).toContain('Mensal');
  });

  test('enviarLembreteAusencia usa o template correto', async () => {
    await whatsappService.enviarLembreteAusencia('67999999999', 'Maria', 9);
    const [msg] = consoleSpy.mock.calls[0];
    expect(msg).toContain(whatsappService.TEMPLATES.LEMBRETE_AUSENCIA);
    expect(msg).toContain('"9"');
  });

  test('enviarLembreteVencimento usa o template correto', async () => {
    await whatsappService.enviarLembreteVencimento('67999999999', 'Maria', 3);
    const [msg] = consoleSpy.mock.calls[0];
    expect(msg).toContain(whatsappService.TEMPLATES.LEMBRETE_VENCIMENTO);
    expect(msg).toContain('"3"');
  });

  test('enviarPaizens (aniversário) usa o template correto', async () => {
    await whatsappService.enviarPaizens('67999999999', 'Maria');
    const [msg] = consoleSpy.mock.calls[0];
    expect(msg).toContain(whatsappService.TEMPLATES.ANIVERSARIO);
    expect(msg).toContain('Maria');
  });

  test('enviarReativacao usa o template correto', async () => {
    await whatsappService.enviarReativacao('67999999999', 'Maria');
    const [msg] = consoleSpy.mock.calls[0];
    expect(msg).toContain(whatsappService.TEMPLATES.REATIVACAO);
    expect(msg).toContain('Maria');
  });

  test('enviar (texto livre) continua mandando type text, sem template — uso restrito à janela de 24h', async () => {
    await whatsappService.enviar('67999999999', 'oi, tudo bem?');
    const [msg] = consoleSpy.mock.calls[0];
    expect(msg).toContain('"type":"text"');
    expect(msg).toContain('oi, tudo bem?');
  });
});

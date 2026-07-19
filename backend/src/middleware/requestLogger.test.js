const requestLogger = require('./requestLogger');
const logger = require('../utils/logger');

function dispararRequisicao(req) {
  const handlers = {};
  const res = { statusCode: 200, on: (evento, cb) => { handlers[evento] = cb; } };
  requestLogger(req, res, () => {});
  handlers.finish();
}

describe('requestLogger', () => {
  test('redige o segredo da catraca embutido no path antes de logar', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => {});

    dispararRequisicao({
      requestId: 'req-1',
      method: 'POST',
      originalUrl: '/api/notifications/catraca/segredo-super-secreto/catra_event',
    });

    expect(spy).toHaveBeenCalledWith('http_request', expect.objectContaining({
      path: '/api/notifications/catraca/[REDACTED]/catra_event',
    }));

    spy.mockRestore();
  });

  test('não mexe em paths que não carregam segredo', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => {});

    dispararRequisicao({ requestId: 'req-2', method: 'GET', originalUrl: '/api/sessoes/atual' });

    expect(spy).toHaveBeenCalledWith('http_request', expect.objectContaining({
      path: '/api/sessoes/atual',
    }));

    spy.mockRestore();
  });
});

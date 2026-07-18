class CatracaOfflineError extends Error {}
class CatracaAuthError extends Error {}

const TIMEOUT_MS = 5000;

function criarClienteCatraca({ nome, host, porta, usuario, senha }) {
  const baseUrl = `http://${host}:${porta}`;
  let session = null;

  async function requisitar(caminho, { body, isBinary = false, comSessao = true, jaTentouRelogin = false } = {}) {
    if (comSessao && !session) await login();

    const url = new URL(`${baseUrl}/${caminho}`);
    if (comSessao) url.searchParams.set('session', session);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': isBinary ? 'application/octet-stream' : 'application/json' },
        body: isBinary ? body : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new CatracaOfflineError(`Catraca ${nome} inacessível: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.status === 401 && comSessao && !jaTentouRelogin) {
      session = null;
      await login();
      return requisitar(caminho, { body, isBinary, comSessao, jaTentouRelogin: true });
    }
    if (!res.ok) {
      throw new Error(`Catraca ${nome} respondeu ${res.status} em ${caminho}`);
    }
    return res.json();
  }

  async function login() {
    let resposta;
    try {
      resposta = await requisitar('login.fcgi', { body: { login: usuario, password: senha }, comSessao: false });
    } catch (err) {
      if (err instanceof CatracaOfflineError) throw err;
      throw new CatracaAuthError(`Falha ao logar na catraca ${nome}: ${err.message}`);
    }
    session = resposta.session;
  }

  async function loadObjects(object, { fields, where, order, limit, offset } = {}) {
    const resposta = await requisitar('load_objects.fcgi', { body: { object, fields, where, order, limit, offset } });
    return resposta[object] || [];
  }

  async function createObjects(object, values) {
    const resposta = await requisitar('create_objects.fcgi', { body: { object, values } });
    return resposta.ids;
  }

  async function destroyObjects(object, where) {
    const resposta = await requisitar('destroy_objects.fcgi', { body: { object, where: { [object]: where } } });
    return resposta.changes;
  }

  async function setUserImage(userId, imagemBuffer) {
    if (!session) await login();
    const url = new URL(`${baseUrl}/user_set_image.fcgi`);
    url.searchParams.set('session', session);
    url.searchParams.set('user_id', userId);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: imagemBuffer,
    });
    if (!res.ok) throw new Error(`Falha ao enviar foto pra catraca ${nome}: ${res.status}`);
  }

  return { nome, login, loadObjects, createObjects, destroyObjects, setUserImage };
}

module.exports = { criarClienteCatraca, CatracaOfflineError, CatracaAuthError };

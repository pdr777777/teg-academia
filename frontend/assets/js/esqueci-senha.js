document.getElementById('form-esqueci-senha').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = ev.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const { mensagem } = await api.post('/api/auth/esqueci-senha', {
      email: document.getElementById('email').value,
    });
    toast(mensagem, 'success');
    ev.target.reset();
  } catch (err) {
    toast(err.message || 'Não foi possível enviar o link.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar link';
  }
});

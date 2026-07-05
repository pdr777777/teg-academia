document.getElementById('form-esqueci-senha').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = ev.target.querySelector('button[type="submit"]');
  setBtnLoading(btn, 'Enviando...');

  try {
    const { mensagem } = await api.post('/api/auth/esqueci-senha', {
      email: document.getElementById('email').value,
    });
    toast(mensagem, 'success');
    ev.target.reset();
  } catch (err) {
    toast(err.message || 'Não foi possível enviar o link.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

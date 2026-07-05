const params = new URLSearchParams(window.location.search);
const token = params.get('token');

if (!token) {
  toast('Link inválido ou expirado. Solicite um novo.', 'error');
}

document.getElementById('form-redefinir-senha').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = ev.target.querySelector('button[type="submit"]');
  const senha = document.getElementById('senha').value;
  const confirmarSenha = document.getElementById('confirmar-senha').value;

  if (!token) {
    toast('Link inválido ou expirado. Solicite um novo.', 'error');
    return;
  }
  if (senha !== confirmarSenha) {
    toast('As senhas não coincidem.', 'error');
    return;
  }

  setBtnLoading(btn, 'Redefinindo...');

  try {
    const { mensagem } = await api.post('/api/auth/redefinir-senha', { token, novaSenha: senha });
    toast(mensagem, 'success');
    setTimeout(() => { window.location.href = 'login.html'; }, 1500);
  } catch (err) {
    toast(err.message || 'Não foi possível redefinir a senha.', 'error');
    resetBtnLoading(btn);
  }
});

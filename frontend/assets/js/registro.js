const params = new URLSearchParams(window.location.search);

document.getElementById('form-registro').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const btn  = form.querySelector('button[type="submit"]');

  const senha         = form.senha.value;
  const confirmarSenha = form.confirmar_senha.value;

  if (senha !== confirmarSenha) {
    toast('As senhas não coincidem.', 'error');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Criando conta...';

  try {
    const { token, user } = await api.post('/api/auth/registro', {
      nome:                   form.nome.value.trim(),
      email:                  form.email.value.trim(),
      senha:                  senha,
      telefone:               form.telefone.value.trim(),
      link_indicacao_origem:  params.get('ref') || undefined,
    });

    localStorage.setItem('token', token);

    // Monta link do WhatsApp com dados do usuário
    const msg = encodeURIComponent(
      `Olá! Acabei de criar minha conta na Academia TEG (${user.nome}) e gostaria de escolher meu plano e finalizar minha matrícula.`
    );
    document.getElementById('btn-whatsapp').href = `https://wa.me/5567993009296?text=${msg}`;

    // Mostra tela de sucesso
    form.style.display = 'none';
    document.getElementById('registro-sucesso').style.display = 'block';

  } catch (err) {
    toast(err.message || 'Erro ao criar conta. Tente novamente.', 'error');
    btn.disabled    = false;
    btn.textContent = 'Criar conta';
  }
});

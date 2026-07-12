document.getElementById('btn-logout').addEventListener('click', logout);

async function carregarPerfil() {
  try {
    const u = await api.get('/api/alunos/perfil');
    document.getElementById('perfil-avatar').textContent = iniciais(u.nome);
    document.getElementById('perfil-nome-display').textContent = u.nome;
    document.getElementById('perfil-email-display').textContent = u.email;
    document.getElementById('perfil-nome').value = u.nome || '';
    document.getElementById('perfil-telefone').value = u.telefone || '';
    document.getElementById('perfil-nascimento').value = u.data_nascimento ? u.data_nascimento.slice(0, 10) : '';
    document.getElementById('perfil-cpf').value = u.cpf || 'Não informado';
  } catch (err) {
    toast(err.message || 'Erro ao carregar seu perfil.', 'error');
  }
}

document.getElementById('form-perfil').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById('btn-perfil-salvar');
  setBtnLoading(btn, 'Salvando...');

  try {
    await api.patch('/api/alunos/perfil', {
      nome: document.getElementById('perfil-nome').value.trim(),
      telefone: document.getElementById('perfil-telefone').value.trim(),
      data_nascimento: document.getElementById('perfil-nascimento').value || null,
    });
    toast('Perfil atualizado!', 'success');
    carregarPerfil();
  } catch (err) {
    toast(err.message || 'Erro ao salvar perfil.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

carregarPerfil();

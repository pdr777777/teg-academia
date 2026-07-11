document.getElementById('form-senha').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById('btn-senha-salvar');
  const senha_atual = document.getElementById('senha-atual').value;
  const nova_senha = document.getElementById('senha-nova').value;
  const confirmar = document.getElementById('senha-confirmar').value;

  if (nova_senha !== confirmar) {
    toast('A confirmação não confere com a nova senha.', 'error');
    return;
  }

  setBtnLoading(btn, 'Salvando...');
  try {
    const { token } = await api.patch('/api/auth/senha', { senha_atual, nova_senha });
    localStorage.setItem('token', token);
    toast('Senha atualizada com sucesso!', 'success');
    document.getElementById('form-senha').reset();
  } catch (err) {
    toast(err.message || 'Erro ao atualizar senha.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

async function carregarAcademia() {
  const form = document.getElementById('form-academia');
  if (!form) return;
  try {
    const cfg = await api.get('/api/configuracoes');
    document.getElementById('academia-nome').value = cfg.nome_academia;
    document.getElementById('academia-meta-faturamento').value = Number(cfg.meta_faturamento_mensal) || '';
    document.getElementById('academia-meta-alunos').value = cfg.meta_novos_alunos_mensal || '';
  } catch (err) {
    toast('Não foi possível carregar os dados da academia.', 'error');
  }
}

const formAcademia = document.getElementById('form-academia');
if (formAcademia) {
  formAcademia.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('btn-academia-salvar');
    setBtnLoading(btn, 'Salvando...');
    try {
      await api.patch('/api/configuracoes', {
        nome_academia: document.getElementById('academia-nome').value.trim(),
        meta_faturamento_mensal: Number(document.getElementById('academia-meta-faturamento').value) || 0,
        meta_novos_alunos_mensal: Number(document.getElementById('academia-meta-alunos').value) || 0,
      });
      toast('Dados da academia atualizados!', 'success');
    } catch (err) {
      toast(err.message || 'Erro ao salvar dados da academia.', 'error');
    } finally {
      resetBtnLoading(btn);
    }
  });
}

carregarAcademia();

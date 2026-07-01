-- indicacoes.lead_id não tinha FK (diferente de todo o resto do schema) — corrige risco de órfão
ALTER TABLE indicacoes
  ADD CONSTRAINT indicacoes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX idx_indicacoes_lead_id ON indicacoes(lead_id);

-- Histórico financeiro/matrículas não deve sumir em cascata (app usa soft-delete via "ativo", nunca DELETE)
ALTER TABLE matriculas DROP CONSTRAINT matriculas_usuario_id_fkey;
ALTER TABLE matriculas ADD CONSTRAINT matriculas_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT;

ALTER TABLE pagamentos DROP CONSTRAINT pagamentos_matricula_id_fkey;
ALTER TABLE pagamentos ADD CONSTRAINT pagamentos_matricula_id_fkey
  FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE RESTRICT;

ALTER TABLE pagamentos DROP CONSTRAINT pagamentos_usuario_id_fkey;
ALTER TABLE pagamentos ADD CONSTRAINT pagamentos_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT;

-- Garante no máximo 1 matrícula ativa por aluno (rotas assumem isso em vários JOINs)
CREATE UNIQUE INDEX idx_matriculas_usuario_ativa_unica ON matriculas(usuario_id) WHERE status = 'ativa';

-- Coerência de datas/horários
ALTER TABLE matriculas ADD CONSTRAINT chk_matriculas_datas CHECK (data_vencimento > data_inicio);
ALTER TABLE aulas ADD CONSTRAINT chk_aulas_horario CHECK (hora_fim > hora_inicio);

-- Índices de performance para consultas já existentes no backend
CREATE INDEX idx_pagamentos_data_pagamento ON pagamentos(data_pagamento);
CREATE INDEX idx_treino_exercicios_exercicio_id ON treino_exercicios(exercicio_id);
CREATE INDEX idx_usuarios_role_ativo ON usuarios(role, ativo);

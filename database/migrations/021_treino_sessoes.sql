-- Sessão de treino ativa: inicia quando o aluno entra (manual hoje, catraca no
-- futuro) e finaliza quando ele encerra pelo app. Guarda duração real na
-- academia. As séries logam carga/reps de fato executados por exercício,
-- diferente de treino_exercicios que guarda só a prescrição do professor.

CREATE TABLE treino_sessoes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  treino_id INTEGER NOT NULL REFERENCES treinos(id) ON DELETE CASCADE,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  duracao_segundos INTEGER,
  origem VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'catraca')),
  status VARCHAR(20) NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'finalizada', 'abandonada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_treino_sessoes_usuario_id ON treino_sessoes(usuario_id);
-- Um aluno só pode ter uma sessão em andamento por vez (a catraca no futuro
-- pode chamar "iniciar" sem duplicar sessão se o aluno já estiver treinando).
CREATE UNIQUE INDEX idx_treino_sessoes_ativa_unica ON treino_sessoes(usuario_id) WHERE status = 'em_andamento';

CREATE TABLE treino_sessao_series (
  id SERIAL PRIMARY KEY,
  sessao_id INTEGER NOT NULL REFERENCES treino_sessoes(id) ON DELETE CASCADE,
  treino_exercicio_id INTEGER NOT NULL REFERENCES treino_exercicios(id) ON DELETE CASCADE,
  numero_serie INTEGER NOT NULL,
  repeticoes_realizadas INTEGER,
  carga_realizada NUMERIC(6,2),
  concluida_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_treino_sessao_series_sessao_id ON treino_sessao_series(sessao_id);

-- Novo motivo de XP: bônus por sessão completa registrada (série a série),
-- além do XP fixo de "treino" que já é dado no check-in/finalização.
ALTER TABLE xp_log DROP CONSTRAINT xp_log_motivo_check;
ALTER TABLE xp_log ADD CONSTRAINT xp_log_motivo_check
  CHECK (motivo IN ('treino', 'sequencia_7d', 'sequencia_30d', 'indicacao', 'conquista', 'matricula', 'sessao_treino'));

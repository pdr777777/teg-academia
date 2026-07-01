CREATE TABLE conquistas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  icone VARCHAR(10),
  xp_recompensa INTEGER NOT NULL DEFAULT 0,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('treinos', 'sequencia', 'indicacao', 'especial')),
  meta INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE aluno_conquistas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  conquista_id INTEGER NOT NULL REFERENCES conquistas(id) ON DELETE CASCADE,
  desbloqueada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(usuario_id, conquista_id)
);

CREATE INDEX idx_aluno_conquistas_usuario_id ON aluno_conquistas(usuario_id);

INSERT INTO conquistas (nome, descricao, icone, xp_recompensa, tipo, meta) VALUES
  ('Primeiro Passo', 'Completou o primeiro treino', '🏋️', 50, 'treinos', 1),
  ('10 Treinos', 'Completou 10 treinos', '🔥', 100, 'treinos', 10),
  ('30 Treinos', 'Completou 30 treinos', '💪', 300, 'treinos', 30),
  ('100 Treinos', 'Lenda da academia', '🏆', 1000, 'treinos', 100),
  ('Semana Perfeita', '7 dias consecutivos treinando', '⚡', 200, 'sequencia', 7),
  ('Mês Implacável', '30 dias consecutivos treinando', '🌟', 1000, 'sequencia', 30),
  ('Primeiro Indicado', 'Indicou o primeiro amigo', '🤝', 200, 'indicacao', 1),
  ('Influenciador', 'Indicou 5 amigos', '👥', 500, 'indicacao', 5);

CREATE TABLE treino_alunos (
  id SERIAL PRIMARY KEY,
  treino_id INTEGER NOT NULL REFERENCES treinos(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_treino_alunos_unique ON treino_alunos(treino_id, usuario_id) WHERE ativo = TRUE;
CREATE INDEX idx_treino_alunos_usuario_id ON treino_alunos(usuario_id);

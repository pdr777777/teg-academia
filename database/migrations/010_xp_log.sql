CREATE TABLE xp_log (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  pontos INTEGER NOT NULL,
  motivo VARCHAR(30) NOT NULL CHECK (motivo IN ('treino', 'sequencia_7d', 'sequencia_30d', 'indicacao', 'conquista', 'matricula')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_xp_log_usuario_id ON xp_log(usuario_id);
CREATE INDEX idx_xp_log_created_at ON xp_log(created_at);

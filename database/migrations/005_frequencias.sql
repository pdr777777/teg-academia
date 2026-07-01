CREATE TABLE frequencias (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_entrada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(usuario_id, data)
);

CREATE INDEX idx_frequencias_usuario_id ON frequencias(usuario_id);
CREATE INDEX idx_frequencias_data ON frequencias(data);

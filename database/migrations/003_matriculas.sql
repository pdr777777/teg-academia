CREATE TABLE matriculas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  plano_id INTEGER NOT NULL REFERENCES planos(id) ON DELETE RESTRICT,
  data_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_vencimento TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'vencida', 'cancelada', 'suspensa')),
  desconto_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matriculas_usuario_id ON matriculas(usuario_id);
CREATE INDEX idx_matriculas_status ON matriculas(status);
CREATE INDEX idx_matriculas_data_vencimento ON matriculas(data_vencimento);

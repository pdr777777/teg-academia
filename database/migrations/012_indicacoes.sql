CREATE TABLE indicacoes (
  id SERIAL PRIMARY KEY,
  indicador_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  lead_id INTEGER,
  convertido_em TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'convertido', 'expirado')),
  desconto_aplicado NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_indicacoes_indicador_id ON indicacoes(indicador_id);
CREATE INDEX idx_indicacoes_status ON indicacoes(status);

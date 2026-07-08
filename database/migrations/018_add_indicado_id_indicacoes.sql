ALTER TABLE indicacoes ADD COLUMN IF NOT EXISTS indicado_id INTEGER REFERENCES usuarios(id);
CREATE INDEX IF NOT EXISTS idx_indicacoes_indicado_id ON indicacoes(indicado_id);

CREATE TABLE planos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  preco_mensal NUMERIC(10,2) NOT NULL,
  duracao_dias INTEGER NOT NULL DEFAULT 30,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO planos (nome, descricao, preco_mensal, duracao_dias) VALUES
  ('Básico', 'Acesso à musculação', 79.90, 30),
  ('Pro', 'Musculação + aulas coletivas', 119.90, 30),
  ('Pro Semestral', 'Musculação + aulas coletivas por 6 meses', 99.90, 180),
  ('Pro Anual', 'Musculação + aulas coletivas por 12 meses', 89.90, 365);

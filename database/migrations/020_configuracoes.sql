CREATE TABLE configuracoes (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome_academia VARCHAR(100) NOT NULL DEFAULT 'TEG Academia',
  meta_faturamento_mensal NUMERIC(10,2) NOT NULL DEFAULT 0,
  meta_novos_alunos_mensal INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracoes (id) VALUES (1);

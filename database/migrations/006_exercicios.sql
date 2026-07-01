CREATE TABLE exercicios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  video_url TEXT,
  grupo_muscular VARCHAR(50),
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exercicios_grupo_muscular ON exercicios(grupo_muscular);

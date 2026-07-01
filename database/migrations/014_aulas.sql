CREATE TABLE aulas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  professor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  capacidade_maxima INTEGER NOT NULL DEFAULT 20,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aulas_dia_semana ON aulas(dia_semana);
CREATE INDEX idx_aulas_ativo ON aulas(ativo);

INSERT INTO aulas (nome, dia_semana, hora_inicio, hora_fim, capacidade_maxima) VALUES
  ('Spinning', 1, '06:00', '07:00', 15),
  ('Spinning', 3, '06:00', '07:00', 15),
  ('Spinning', 5, '06:00', '07:00', 15),
  ('Funcional', 2, '07:00', '08:00', 20),
  ('Funcional', 4, '07:00', '08:00', 20),
  ('Zumba', 3, '19:00', '20:00', 25),
  ('Yoga', 6, '09:00', '10:00', 20);

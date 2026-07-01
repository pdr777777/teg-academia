CREATE TABLE treino_exercicios (
  id SERIAL PRIMARY KEY,
  treino_id INTEGER NOT NULL REFERENCES treinos(id) ON DELETE CASCADE,
  exercicio_id INTEGER NOT NULL REFERENCES exercicios(id) ON DELETE CASCADE,
  series INTEGER NOT NULL DEFAULT 3,
  repeticoes VARCHAR(20) NOT NULL DEFAULT '12',
  carga VARCHAR(20),
  descanso_segundos INTEGER DEFAULT 60,
  ordem INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT
);

CREATE INDEX idx_treino_exercicios_treino_id ON treino_exercicios(treino_id);

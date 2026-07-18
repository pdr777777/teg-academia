-- database/migrations/029_catraca.sql
-- Integração com as catracas Control iD iDFace MAX. Todo registro criado
-- pelo TEG na catraca usa registration com prefixo "TEG-" e nunca toca em
-- objeto criado pelo CloudGym (sistema antigo, continua rodando em paralelo).

CREATE TABLE catraca_usuarios (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  catraca VARCHAR(10) NOT NULL,
  catraca_user_id INTEGER NOT NULL,
  face_status VARCHAR(20) NOT NULL DEFAULT 'pendente_presencial'
    CHECK (face_status IN ('sincronizado', 'pendente_presencial', 'erro')),
  grupo_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, catraca)
);

CREATE INDEX idx_catraca_usuarios_usuario_id ON catraca_usuarios(usuario_id);

CREATE TABLE catraca_cursor (
  catraca VARCHAR(10) PRIMARY KEY,
  ultimo_evento_id INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE catraca_eventos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  catraca VARCHAR(10) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('autorizado', 'negado', 'nao_identificado')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catraca_eventos_criado_em ON catraca_eventos(criado_em);
CREATE INDEX idx_catraca_eventos_usuario_id ON catraca_eventos(usuario_id);

ALTER TABLE configuracoes ADD COLUMN catraca_ativa BOOLEAN NOT NULL DEFAULT TRUE;

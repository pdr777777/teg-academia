ALTER TABLE usuarios
  ADD COLUMN reset_token_hash VARCHAR(64),
  ADD COLUMN reset_token_expira TIMESTAMPTZ;

CREATE INDEX idx_usuarios_reset_token_hash ON usuarios(reset_token_hash);

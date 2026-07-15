ALTER TABLE usuarios
  ADD COLUMN tentativas_login_falhas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN bloqueado_ate TIMESTAMPTZ;

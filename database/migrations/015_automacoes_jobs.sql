CREATE TABLE automacoes_log (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('ausencia', 'vencimento', 'aniversario', 'boas_vindas', 'indicacao_convertida')),
  mensagem TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'erro')),
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
  agendado_para TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executado_em TIMESTAMPTZ,
  erro TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automacoes_log_usuario_id ON automacoes_log(usuario_id);
CREATE INDEX idx_automacoes_log_tipo ON automacoes_log(tipo);
CREATE INDEX idx_jobs_status_agendado ON jobs(status, agendado_para) WHERE status IN ('pendente', 'erro');

CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  telefone VARCHAR(20) NOT NULL,
  email VARCHAR(150),
  objetivo VARCHAR(30) CHECK (objetivo IN ('emagrecimento', 'hipertrofia', 'condicionamento', 'outro')),
  origem VARCHAR(30) NOT NULL DEFAULT 'site' CHECK (origem IN ('site', 'indicacao', 'instagram', 'whatsapp', 'outro')),
  indicador_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  status_pipeline VARCHAR(20) NOT NULL DEFAULT 'novo_lead' CHECK (status_pipeline IN ('novo_lead', 'contato', 'visitou', 'matriculado', 'perdido')),
  observacoes TEXT,
  data_visita_agendada TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pipeline_historico (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status_anterior VARCHAR(20),
  status_novo VARCHAR(20) NOT NULL,
  observacao TEXT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_status_pipeline ON leads(status_pipeline);
CREATE INDEX idx_leads_telefone ON leads(telefone);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_pipeline_historico_lead_id ON pipeline_historico(lead_id);

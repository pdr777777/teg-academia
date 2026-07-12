-- Histórico da conversa entre a IA e o lead no WhatsApp — mantém contexto
-- entre mensagens e dá pra mostrar a conversa dentro do CRM depois.
CREATE TABLE lead_mensagens (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direcao VARCHAR(10) NOT NULL CHECK (direcao IN ('recebida', 'enviada')),
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_mensagens_lead_id ON lead_mensagens(lead_id);

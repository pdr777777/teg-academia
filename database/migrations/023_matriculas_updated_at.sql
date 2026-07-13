-- Fix: matriculas nunca teve updated_at, diferente das outras tabelas
-- (usuarios, leads, configuracoes). Vários pontos do backend já assumiam
-- essa coluna (admin.js renovar, webhooks.js, pagamentos.js) mas nunca
-- foram exercitados contra o schema real antes do jobWorker (Task 6)
-- expor a lacuna.
ALTER TABLE matriculas
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

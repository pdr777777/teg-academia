-- Cobrança recorrente: adapter de gateway plugável (ver
-- backend/src/services/gateway/) e bloqueio gradual por inadimplência.
-- gerado_automaticamente distingue o pagamento de renovação criado pelo
-- jobWorker (que ao ser confirmado estende data_vencimento) dos pagamentos
-- de matrícula inicial ou renovação manual pelo admin (que já estendem
-- data_vencimento na hora, ver PATCH /admin/matriculas/:id/renovar).
ALTER TABLE pagamentos
  ADD COLUMN gateway VARCHAR(30),
  ADD COLUMN gateway_charge_id VARCHAR(100),
  ADD COLUMN link_pagamento TEXT,
  ADD COLUMN tentativa INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN gerado_automaticamente BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_pagamentos_gateway_charge_id ON pagamentos(gateway_charge_id) WHERE gateway_charge_id IS NOT NULL;

ALTER TABLE configuracoes
  ADD COLUMN dias_tolerancia_bloqueio INTEGER NOT NULL DEFAULT 5;

ALTER TABLE automacoes_log DROP CONSTRAINT automacoes_log_tipo_check;
ALTER TABLE automacoes_log ADD CONSTRAINT automacoes_log_tipo_check
  CHECK (tipo IN ('ausencia', 'vencimento', 'aniversario', 'boas_vindas', 'indicacao_convertida', 'atraso'));

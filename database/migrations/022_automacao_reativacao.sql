-- Novo tipo de automação: reativação. 15 dias depois que o plano vence sem
-- renovar, manda uma mensagem de "sentimos sua falta" com um desconto de
-- R$10 na mensalidade pra incentivar a voltar. É oferta única (não repete).
ALTER TABLE automacoes_log DROP CONSTRAINT automacoes_log_tipo_check;
ALTER TABLE automacoes_log ADD CONSTRAINT automacoes_log_tipo_check
  CHECK (tipo IN ('ausencia', 'vencimento', 'aniversario', 'boas_vindas', 'indicacao_convertida', 'reativacao'));

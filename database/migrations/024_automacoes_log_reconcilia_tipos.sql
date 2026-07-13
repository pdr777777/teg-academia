-- Reconciliação: duas branches em paralelo mexeram na mesma constraint
-- (022_financeiro_cobranca_recorrente.sql adicionou 'atraso',
-- 022_automacao_reativacao.sql adicionou 'reativacao' — cada ADD CONSTRAINT
-- substitui a definição inteira em vez de estender, então rodar as duas em
-- sequência perderia um dos dois valores). Esta migration é o estado final
-- correto com todos os tipos usados até aqui.
ALTER TABLE automacoes_log DROP CONSTRAINT automacoes_log_tipo_check;
ALTER TABLE automacoes_log ADD CONSTRAINT automacoes_log_tipo_check
  CHECK (tipo IN ('ausencia', 'vencimento', 'aniversario', 'boas_vindas', 'indicacao_convertida', 'atraso', 'reativacao'));

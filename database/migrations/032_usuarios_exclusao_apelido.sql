-- Exclusao logica de aluno (distinta de `ativo`, que e a chavinha manual de
-- bloqueio/liberacao de acesso na catraca) e apelido de exibicao editavel
-- pelo proprio aluno.
ALTER TABLE usuarios ADD COLUMN excluido_em TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN apelido VARCHAR(60);

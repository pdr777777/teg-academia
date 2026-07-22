-- Permite atribuir mais de um treino ativo por aluno, um por dia da semana
-- (ex: seg=Push, qua=Pull, sex=Legs), em vez de um treino unico substituido
-- toda vez que o professor reatribui. NULL = treino vale todo dia (mantem o
-- comportamento atual pra quem so tem 1 treino, sem quebrar nada existente).
ALTER TABLE treino_alunos ADD COLUMN dia_semana SMALLINT CHECK (dia_semana BETWEEN 0 AND 6);
COMMENT ON COLUMN treino_alunos.dia_semana IS '0=domingo..6=sabado. NULL = vale todo dia.';

-- A unica antiga so impedia o MESMO treino duas vezes ativo pro aluno; agora
-- o que precisa ser unico e o "slot" (aluno + dia), pra nao ter dois treinos
-- ativos disputando o mesmo dia. COALESCE trata NULL como um slot proprio.
DROP INDEX idx_treino_alunos_unique;
CREATE UNIQUE INDEX idx_treino_alunos_unique_dia ON treino_alunos(usuario_id, COALESCE(dia_semana, -1)) WHERE ativo = TRUE;

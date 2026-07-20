-- Guarda a origem externa do aluno quando ele não tem matrícula cobrada
-- diretamente pela TEG (ex: Gympass/Totalpass, personal, parceria, convênio).
-- Usado pelo import da base antiga da CloudGym e exibido como badge no
-- painel admin no lugar do nome do plano.
ALTER TABLE usuarios ADD COLUMN origem_externa VARCHAR(40);

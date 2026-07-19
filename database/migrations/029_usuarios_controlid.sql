-- Vincula o usuário TEG ao ID interno do dispositivo Control iD (iDFace MAX)
-- que faz o reconhecimento facial na catraca. O device é quem decide sozinho
-- se libera o acesso (reconhecimento local) — esse vínculo só serve pra
-- traduzir o evento de acesso (Monitor API, catra_event) em "qual aluno é
-- esse" e assim iniciar a sessão de treino automaticamente no app.
ALTER TABLE usuarios ADD COLUMN controlid_user_id VARCHAR(30);
CREATE UNIQUE INDEX idx_usuarios_controlid_user_id ON usuarios(controlid_user_id) WHERE controlid_user_id IS NOT NULL;

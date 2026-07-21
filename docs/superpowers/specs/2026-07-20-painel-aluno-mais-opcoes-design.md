# Painel do Aluno no Admin — Reorganização, "Mais Opções", Frequência e Foto/Apelido (2026-07-20)

## Contexto

A tela `frontend/admin/alunos.html` acumulou, em sessões anteriores, um botão
"Novo Cliente" (cadastro + matrícula) e, depois, um botão "Adicionar aluno"
(mesmo fluxo + verificação facial) lado a lado — o usuário quer só o segundo.
A fileira de cada aluno hoje tem uma chavinha (`PATCH /api/admin/alunos/:id/toggle`)
mais 3 botões de ícone soltos (matricular/renovar, redefinir senha, vincular
catraca), sem organização visual. Não existe hoje nenhum endpoint de detalhe
de 1 aluno (`GET /api/admin/alunos/:id`), nem de exclusão, nem visualização
de frequência por aluno no admin, nem UI de foto de perfil em lugar nenhum do
sistema (nem no admin, nem no app/site do aluno) — o campo `usuarios.foto_url`
existe no banco mas não é lido nem escrito por nenhuma tela hoje.

**Achado técnico que corrige um bug, não só organiza:** a chavinha
(`admin.js:179-190`, `PATCH /alunos/:id/toggle`) só faz
`UPDATE usuarios SET ativo = NOT ativo` — **nunca chama**
`catracaService.liberarAcesso`/`bloquearAcesso`. Ou seja, hoje desligar a
chavinha não bloqueia ninguém na catraca de verdade. Isso é consertado nesta
entrega (item 2).

## Escopo

### 1. Fileira da tabela — um botão só, mais organizado

- `frontend/admin/alunos.html`: remove o botão "Novo Cliente" e o diálogo
  `dialog-novo-cliente` (`admin-alunos.js:245-291` some junto) — só sobra
  "Adicionar aluno" (já cobre cadastro + plano + facial, ver spec/plano de
  2026-07-20 anteriores).
- A célula de ações da tabela (`admin-alunos.js:74-92`) deixa de ter 3
  botões de ícone soltos. Fica: chavinha de acesso com rótulo pequeno ao
  lado (`<span class="switch-label">Acesso à academia</span>`, mesmo texto
  que já existe hoje só como `title` do `<label class="switch">`, agora
  visível) + um único botão "Mais opções" (ícone novo `more-vertical` no
  mapa do `icons.js` — equivalente real no Coolicons, `Menu/More_Vertical.svg`,
  já mapeado na pesquisa da iteração anterior de ícones, só não estava entre
  os 44 trocados por não ter uso ativo até agora).
- As 3 ações que hoje são ícones soltos (matricular/renovar, redefinir
  senha, vincular catraca) passam a viver dentro do painel "Mais opções"
  (item 3) — não desaparecem, só mudam de lugar.

### 2. Chavinha vinculada à catraca de verdade

Em `PATCH /api/admin/alunos/:id/toggle` (`admin.js:179-190`), depois do
`UPDATE`, chamar `catracaService.liberarAcesso(id)` quando `ativo` virou
`true`, ou `catracaService.bloquearAcesso(id)` quando virou `false` —
mesmo padrão try/catch + `logger.error` já usado nos outros ganchos de
catraca (`admin.js` matrículas, `matriculas.js:49-54`).

### 3. Painel "Mais opções" — detalhe do aluno (novo diálogo)

Novo endpoint `GET /api/admin/alunos/:id` (não existe hoje) retornando:
`nome, email, telefone, cpf, apelido, foto_url, ativo, controlid_user_id`,
mais os dados calculados:
- **Plano + vencimento**: mesmo `LEFT JOIN matriculas m ON m.usuario_id = u.id
  AND m.status = 'ativa'` já usado na listagem (`admin.js:166`), aplicado a
  1 aluno.
- **Última mensalidade**: `MAX(pagamentos.data_pagamento) WHERE usuario_id =
  $1 AND status = 'pago'`.

Novo diálogo `dialog-detalhe-aluno` (`frontend/admin/alunos.html`), aberto
pelo botão "Mais opções" de cada linha, com:
- Avatar (foto se `foto_url` existir, senão iniciais — mesmo padrão
  `avatar-fallback`/`iniciais()` já usado na tabela).
- CPF, e-mail, telefone, plano atual, vencimento, última mensalidade.
- Atalhos que hoje são os 3 ícones soltos: "Matricular/Renovar" (reabre a
  lógica de `abrirDialogMatricula`, já existente), "Redefinir senha" (reabre
  o `prompt` já existente), "Vincular à catraca" (idem).
- Gráfico de Frequência (item 4).
- Botão "Excluir aluno" (item 5).

### 4. Gráfico de Frequência (últimos 30 dias)

Novo endpoint `GET /api/admin/alunos/:id/frequencia` — gera os últimos 30
dias via `generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day')` com
`LEFT JOIN frequencias` (mesma tabela/granularidade 1-linha-por-dia já usada
pelo calendário do próprio aluno em `GET /api/frequencias/minha`,
`frequencias.js`), retornando `[{ data: 'YYYY-MM-DD', foi: boolean }, ...]`.

Componente visual novo (`frontend/assets/css/admin.css`): grid de 30
quadradinhos, reaproveitando exatamente o padrão visual já validado no
calendário do aluno (`dashboard.css:136-146`, classes `.cal-dia`/`.treinou`)
— dia com check-in = `background: var(--color-primary)`, dia sem = cinza
apagado (`var(--color-surface-2)` + texto `var(--color-muted)`, igual ao
`.cal-dia` default). Diferença: aqui é uma janela rolante de 30 dias (não
mês-calendário), então sem offset de dia-da-semana — grid simples
`repeat(10, 1fr)` (3 fileiras de 10) ou `repeat(15, 1fr)` (2 fileiras de 15),
decisão de layout fina fica pro plano. Abaixo do grid, legenda nova (não
existe hoje nem no componente do aluno): quadradinho colorido + "Foi",
quadradinho cinza + "Faltou".

### 5. Excluir aluno (soft-delete, reversível)

**Decisão de schema:** não reaproveita `usuarios.ativo` pra isso — misturar
"chavinha temporariamente desligada" (aluno continua sendo cliente, deveria
seguir aparecendo na lista) com "excluído" (não deveria mais aparecer na
lista) no mesmo booleano geraria um bug de UX (desligar a chavinha faria o
aluno sumir da lista, o que ninguém pediu). Migration nova
(`database/migrations/032_usuarios_exclusao.sql`):
```sql
ALTER TABLE usuarios ADD COLUMN excluido_em TIMESTAMPTZ;
```
- Novo endpoint `DELETE /api/admin/alunos/:id`: seta `excluido_em = NOW()` e
  `ativo = FALSE` (garante bloqueio na catraca também, chamando
  `catracaService.bloquearAcesso`), idempotente.
- `GET /api/admin/alunos` (listagem, `admin.js:146-176`) passa a filtrar
  `AND u.excluido_em IS NULL` por padrão — aluno excluído some da lista.
  Histórico financeiro (`matriculas`/`pagamentos`) continua intacto no
  banco, sem tocar nas constraints `ON DELETE RESTRICT` já existentes
  (`016_integridade_e_indices.sql`).
- Frontend: botão "Excluir aluno" dentro do painel "Mais opções" abre um
  diálogo de confirmação (texto tipo "Isso vai remover [nome] da lista de
  alunos e bloquear o acesso dele na academia. Essa ação pode ser desfeita
  só por um desenvolvedor direto no banco.") antes de chamar o `DELETE`.

### 6. Foto de perfil + apelido (Supabase Storage)

- Migration nova (mesma `032_usuarios_exclusao.sql` ou uma dedicada —
  decisão fina do plano): `ALTER TABLE usuarios ADD COLUMN apelido
  VARCHAR(60);`
- `apelido` entra em `CAMPOS_PERMITIDOS` do `PATCH /api/alunos/perfil`
  (`alunos.js:73`) — aluno edita o próprio apelido no perfil dele
  (`frontend/perfil.html`/`perfil.js`), sem UI nova no admin pra editar (só
  exibição, no painel "Mais opções").
- **Upload de foto**: novo endpoint `POST /api/alunos/perfil/foto`
  (`multipart/form-data`, 1 arquivo), usando `multer` (memory storage, novo
  na lista de dependências do backend) pra receber o arquivo, valida
  tipo/tamanho (`image/jpeg|png|webp`, limite ~5MB), sobe pro Supabase
  Storage (bucket novo `fotos-perfil`, público-leitura) via
  `@supabase/supabase-js` (novo pacote — SDK oficial, evita reimplementar
  o fluxo de upload assinado na mão), grava a URL pública resultante em
  `usuarios.foto_url`, retorna a URL nova.
- Novas env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (chave de
  serviço, não a `anon` — o upload é feito pelo backend depois de validar
  o JWT do aluno, não direto do navegador).
- Frontend: `frontend/perfil.html`/`perfil.js` ganha um input de arquivo +
  preview no avatar (hoje só mostra iniciais, `perfil.js:6`); o mesmo
  `<img>`/fallback-de-iniciais passa a ser usado em `dashboard.js:51` e no
  avatar da tabela/painel do admin (`admin-alunos.js:65` e o novo painel do
  item 3) — um componente pequeno reaproveitado nos 3 lugares
  (`renderAvatar(nome, foto_url)` ou similar, decisão do plano).

## Fora de escopo

- Editar `apelido`/CPF/telefone pelo admin (painel é só leitura desses
  campos nesta entrega; edição continua sendo self-service do aluno via
  perfil, como já é hoje pros campos existentes).
- Upload de foto feito pela recepção/funcionário (usuário escolheu:
  só o próprio aluno sobe a foto, no perfil dele).
- Reverter uma exclusão pela UI (fica como operação manual no banco por
  enquanto — não existe tela "alunos excluídos" nesta entrega).
- Trocar as constraints `ON DELETE RESTRICT` de `matriculas`/`pagamentos`
  pra permitir exclusão física — decisão deliberada da migration 016,
  mantida.
- Layout exato do grid de 30 dias (quantas colunas/fileiras) — decisão
  fina do plano de implementação, não da spec.
- Redimensionar/otimizar a imagem no upload (fica o arquivo como o
  navegador mandar, dentro do limite de tamanho) — sem pipeline de
  compressão/thumbnail nesta entrega.

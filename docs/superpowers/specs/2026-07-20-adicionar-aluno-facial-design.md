# Assistente "Adicionar aluno" com cadastro facial (2026-07-20)

## Contexto

A página `frontend/admin/alunos.html` já tem um botão **"Novo Cliente"**
(`admin-alunos.js:245-291`) que cria a conta (`POST /api/auth/registro`) e, ao
concluir, abre automaticamente o diálogo `dialog-matricula` pra escolher plano
e forma de pagamento (`POST /api/admin/matriculas`, `admin.js:250`). O usuário
pediu um **botão novo, separado** desse, que cubra o mesmo processo (dados →
plano) e adicione uma etapa que não existe hoje: **cadastro facial na
catraca**, pra matrículas feitas presencialmente.

**Achado técnico que muda o escopo:** `POST /api/admin/matriculas`
(`admin.js:250-298`) — o endpoint que tanto o "Novo Cliente" quanto o novo
assistente vão usar — **nunca chama** `catracaService.sincronizarAluno`/
`liberarAcesso`. Só os fluxos de auto-matrícula (`matriculas.js:50-51`),
confirmação de pagamento (`pagamentos.js:63,88`) e webhook
(`webhooks.js:34`) fazem essa chamada hoje. Isso significa que um aluno
matriculado pelo admin com pagamento confirmado na hora **nunca é criado na
catraca** — sem isso, não existe `catraca_user_id` nenhum contra o qual
verificar um rosto. Esta spec inclui fechar essa lacuna como pré-requisito.

**Como o cadastro facial funciona de verdade** (confirmado com o usuário): a
captura do rosto acontece **no próprio equipamento** iDFace — o funcionário
leva o aluno até a catraca e cadastra o rosto pela interface do equipamento.
O TEG não fotografa nem faz reconhecimento facial no navegador. O papel do
TEG é: (1) garantir que o aluno já existe como `usuário TEG-<id>` na catraca
antes de mandar o funcionário pra lá, e (2) permitir *confirmar* depois que
o rosto foi cadastrado, consultando a API da catraca.

## Escopo

### 1. Corrigir lacuna: sincronizar com a catraca ao criar matrícula via admin

Em `POST /api/admin/matriculas` (`admin.js:250-298`), quando
`statusMatricula === 'ativa'` (pagamento informado na hora — mesmo bloco que
já dá XP e converte indicação, linhas 281-292), chamar
`catracaService.sincronizarAluno(usuario_id)` seguido de
`catracaService.liberarAcesso(usuario_id)`, no mesmo padrão de try/catch +
log (sem propagar erro 500) já usado em `pagamentos.js:63-66` e
`webhooks.js:34-37`. Falha de rede aqui não deve impedir a resposta da
matrícula — o `reconciliar()` diário já existente fecha a lacuna se isso
falhar.

### 2. Backend novo: verificar cadastro facial direto no equipamento

- `catracaService.verificarRostoCadastrado(usuarioId)` — para cada catraca
  configurada (`catracasConfiguradas()`, hoje 2), busca o mapeamento em
  `catraca_usuarios` (usuario_id + catraca → `catraca_user_id`); se não
  houver mapeamento pra alguma catraca, ignora essa catraca (usuário ainda
  não sincronizado lá). Pro que tiver mapeamento, consulta
  `client.loadObjects('user_faces', { where: { user_faces: { user_id:
  catraca_user_id } } })`. Se retornar pelo menos um registro, atualiza
  `catraca_usuarios.face_status = 'sincronizado'` pra aquela catraca. Retorna
  um resumo por catraca: `{ catraca, encontrado: boolean }[]`.
  - **Risco técnico assumido:** `user_faces` como nome de objeto na API REST
    da Control iD **não foi testado contra o equipamento real** — é a
    convenção mais provável dado o padrão dos outros objetos já usados
    (`users`, `user_groups`, `access_logs`), mas só a validação manual contra
    as duas iDFace físicas confirma. Mesma categoria de risco que o resto da
    integração já assume (ver spec da catraca, seção 7 "Testes").
- `POST /api/catraca/:usuarioId/verificar-rosto` (admin/dono), em
  `backend/src/routes/catraca.js` — chama
  `verificarRostoCadastrado`, retorna o resumo por catraca. Se **nenhuma**
  catraca confirmou o rosto, responde `200` com `sincronizado: false` (não é
  erro — é um estado normal de "ainda não cadastrou", o front decide o que
  mostrar).

### 3. Frontend: assistente "Adicionar aluno" (botão novo, separado)

Botão **"Adicionar aluno"** no canto superior direito da barra de ações da
página Alunos (`frontend/admin/alunos.html`, ao lado — não no lugar — do
"Novo Cliente" existente, mesmo `.filters-row`). Abre um diálogo novo
(`dialog-adicionar-aluno`) com indicador de progresso e 3 passos:

1. **Dados** — nome, e-mail, telefone (mesmos campos do "Novo Cliente";
   `POST /api/auth/registro`).
2. **Plano** — select de plano + forma de pagamento (mesmos campos do
   `dialog-matricula` existente; `POST /api/admin/matriculas`).
3. **Matrícula presencial?** — toggle Sim/Não.
   - **Não** → encerra o assistente normalmente (fica `pendente_presencial`,
     igual ao comportamento atual do "Novo Cliente" hoje).
   - **Sim** → mostra a tela "Leve o aluno até a catraca pra cadastrar o
     rosto" com um botão **"Verificar cadastro"**, que chama
     `POST /api/catraca/:usuarioId/verificar-rosto`. Se confirmado em pelo
     menos uma catraca, mostra sucesso e fecha. Se não confirmado, mostra
     "Ainda não encontramos o cadastro — tente de novo depois de cadastrar
     no equipamento", permitindo tentar de novo sem perder o progresso
     (usuário e matrícula já foram salvos nos passos 1-2, então repetir a
     verificação é sempre seguro/idempotente).

Navegação entre os 3 passos é só pra frente (sem botão "voltar" pros passos
1-2, já que cada passo grava no backend antes de avançar — voltar
implicaria desfazer o registro, fora de escopo). Cancelar em qualquer passo
fecha o diálogo; se os passos 1-2 já foram concluídos (conta e matrícula
criadas), cancelar no passo 3 não desfaz nada — só deixa o aluno como
`pendente_presencial`, exatamente como o "Novo Cliente" atual já deixa hoje
quando ninguém mexe na foto.

## Fora de escopo

- Qualquer captura de foto/webcam no navegador — a spec anterior já rejeitou
  essa abordagem; a captura é sempre no equipamento físico.
- Unificar ou remover o botão "Novo Cliente" existente — continua como está,
  sem a etapa de verificação facial.
- Botão "voltar" entre os passos do assistente.
- Consertar a lacuna equivalente em `PATCH /api/admin/matriculas/:id/renovar`
  (renovação de matrícula já teria criado o usuário na catraca na matrícula
  original) — fora do que foi pedido.
- Testar de fato contra o equipamento físico nesta entrega — fica como
  validação manual pós-deploy, mesmo padrão já usado pro resto da integração
  de catraca.

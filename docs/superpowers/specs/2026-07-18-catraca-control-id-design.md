# Controle de Acesso / Catraca (Control iD) — Design

Data: 2026-07-18
Contexto: segunda fatia do roadmap de paridade com o CloudGym (a primeira foi
[financeiro/cobrança recorrente](2026-07-12-financeiro-cobranca-recorrente-design.md)).
Ver [[teg-pendencias-2026-07-13-financeiro]] pro contexto do roadmap completo
(CRM, catraca, marketing, IA, social/gamificação).

## Contexto físico (levantado com o Matias em 2026-07-18)

- Duas catracas **Control iD iDFace MAX** (firmware 7.8.4), mesma entrada,
  redundância entrada/saída. IPs locais `192.168.100.129` e `192.168.100.130`,
  porta web 80. Acesso externo já configurado (porta liberada/VPN) — o backend
  no Railway consegue chamar a API local das duas diretamente.
- Ambas em "Modo iDCloud" (reportam pra nuvem própria da Control iD,
  `push.idsecure.com.br`) — **não é isso que o CloudGym usa**.
- O CloudGym (sistema antigo, `app.cloudgym.io`) fala com as catracas através
  de um agente Windows local próprio (janela "Cloud Gym - Access Control",
  status "Catraca Online / Database Online" + botão manual "Liberar Acesso"),
  que acessa a API REST local do equipamento (a mesma exposta em
  `192.168.100.x/pt_BR/html/...`) — não usa o modo iDCloud.
- Hoje: **4796 usuários / 4110 faces cadastrados** no equipamento (geridos
  pelo CloudGym), ~1000 alunos ativos de verdade. RAM do equipamento já em 87%.
- **O CloudGym continua rodando integralmente durante e depois desta entrega.**
  A substituição definitiva é decisão futura, separada, fora desta fatia.

## Princípio central: aditivo, nunca destrutivo

O TEG nunca lê, edita, apaga ou reutiliza um registro criado pelo CloudGym.
Toda escrita do TEG na catraca:

- usa `registration = "TEG-<usuario_id>"` (nunca colide com o esquema do
  CloudGym);
- deixa o equipamento gerar o `id` do usuário (nunca fixamos um id nosso);
- só afeta um grupo/regra de acesso próprio (`TEG-ativos`), nunca os grupos ou
  regras que o CloudGym já mantém;
- leituras de `access_logs` via `load_objects` são não-destrutivas (GET simples
  com cursor próprio, filtra por `id > cursor`) — não interferem no que o
  agente do CloudGym também lê.

**Limitação conhecida e aceita** (decisão do Matias em 2026-07-18): como o
mesmo aluno físico pode ficar com **dois cadastros faciais** (o antigo do
CloudGym + o novo do TEG) durante a convivência dos dois sistemas, o bloqueio
automático do TEG por inadimplência não impede 100% das vezes que a pessoa
entre pelo reconhecimento do cadastro antigo do CloudGym, que continua ativo.
Isso só se resolve de fato quando o CloudGym for desligado. Não é bug — é
consequência aceita da convivência.

## Escopo de sincronização

Só alunos com **matrícula ativa no TEG** (`matriculas.status = 'ativa'`) —
hoje ~1000, não os ~4796 cadastrados historicamente no CloudGym. Esse
critério já existe no schema, não precisa de dado novo.

**Rollout em duas etapas** (não é fase de escopo, é ordem de execução segura):
1. Sincronizar um punhado de contas de teste (Matias + 2-3 alunos), validar
   que aparecem certo nas duas catracas, checar reconhecimento facial e
   check-in indo pro TEG.
2. Rodar o sync pros ~1000 ativos.

## 1. Modelo de dados (migration nova)

- `catraca_usuarios`: mapeamento `usuario_id` ↔ id atribuído pelo equipamento,
  por catraca.
  - `usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE`
  - `catraca` VARCHAR(10) — `'catraca1'` | `'catraca2'`
  - `catraca_user_id INTEGER` — id retornado pelo equipamento
  - `face_status` VARCHAR(20) — `'sincronizado'` | `'pendente_presencial'` | `'erro'`
  - `grupo_ativo BOOLEAN` — está no grupo `TEG-ativos` agora?
  - `updated_at`
  - UNIQUE(`usuario_id`, `catraca`)
- `catraca_cursor`: cursor de leitura de `access_logs`, um registro por catraca
  (`catraca`, `ultimo_evento_id`).
- `catraca_eventos`: log bruto de cada evento de acesso recebido (alimenta o
  dashboard — gráfico e feed ao vivo). `usuario_id` (nullable, se não
  reconhecido), `catraca`, `tipo` (`'autorizado'`|`'negado'`|`'nao_identificado'`),
  `criado_em`.
- `frequencias`: sem mudança estrutural — regra de 1 check-in/dia
  (`UNIQUE(usuario_id, data)` já existente) é respeitada; evento de catraca
  duplicado no mesmo dia é ignorado, sem erro, sem XP duplicado. A origem
  (app × catraca) fica registrada em `catraca_eventos`, não precisa duplicar
  em `frequencias`.
- `configuracoes`: nova coluna `catraca_ativa BOOLEAN NOT NULL DEFAULT true` —
  liga/desliga a integração sem redeploy (mesmo padrão de
  `dias_tolerancia_bloqueio`).

## 1.1 Achado durante o design: webhook especulativo do Pedro

Existe um endpoint `POST /api/sessoes/catraca-checkin` ([sessoes.js:154](../../../backend/src/routes/sessoes.js#L154)),
protegido por `CATRACA_WEBHOOK_SECRET` (já em `.env.example`), que o Pedro
escreveu especulativamente ("catraca no futuro", comentário na migration
`021_treino_sessoes.sql`) — **nunca testado contra o equipamento real**.
Ele espera JSON `{ usuario_id | cpf }` num path fixo `/api/sessoes/catraca-checkin`.

Isso não bate com o que a iDFace realmente envia em "Modo Personalizado"
(`application/x-www-form-urlencoded`, path fixo `/new_user_identified.fcgi`,
campos `device_id/user_id/event/time/portal_id/user_name/confidence` — sem
CPF). Decisão do Matias em 2026-07-18: **não trocar o Modo de Operação**
(fica em iDCloud, sem mexer), então esse endpoint não é usado pela integração
real por enquanto — o check-in vem do polling de `access_logs` (seção 2).

**Reaproveitamento, não duplicação:** o polling não insere em `frequencias`
sozinho por acaso — ele chama a mesma função `iniciarSessao` que
`sessoes.js` já usa (extraída pra `backend/src/services/sessaoService.js`
nesta entrega), pra ganhar de graça o auto-início de sessão de treino
quando o aluno tem `treino_alunos` ativo. Como isso falha (400) quando o
aluno não tem treino atribuído — caso comum e esperado, não é erro — o
polling também garante um registro em `frequencias` diretamente (com XP),
sem depender de o aluno abrir o app pra "finalizar" a sessão depois. Isso é
importante: sem o insert direto, um aluno sem treino atribuído nunca geraria
frequência via catraca nenhuma, o que anularia o ponto principal do recurso.

## 2. Cliente da API Control iD (`backend/src/services/catraca/`)

- `controlIdClient.js` — cliente HTTP de baixo nível por equipamento: login
  por sessão (com re-login automático se expirar), `loadObjects`,
  `createObjects`, `modifyObjects`, `destroyObjects` genéricos sobre
  `load_objects.fcgi`/`create_objects.fcgi`/etc. Timeout curto e erros
  tipados (`CatracaOfflineError`, `CatracaAuthError`) pra quem chama decidir
  o que fazer.
- `catracaService.js` — regra de negócio, sempre operando nas duas catracas:
  - `sincronizarAluno(usuarioId)` — cria/atualiza `users` (registration
    `TEG-<id>`), tenta enviar `foto_url` como face; se rejeitada, marca
    `face_status = 'pendente_presencial'` e segue. Idempotente via
    `catraca_usuarios` (não recria se já existe).
  - `liberarAcesso(usuarioId)` / `bloquearAcesso(usuarioId)` — inclui/remove
    do grupo `TEG-ativos` nas duas catracas.
  - `processarNovosAcessos()` — para cada catraca, `load_objects` em
    `access_logs` com `id > cursor`, filtra só usuários cujo `registration`
    tem prefixo `TEG-` (resolve pro `usuario_id` via `catraca_usuarios`),
    grava em `catraca_eventos` sempre (autorizado/negado/não identificado —
    telemetria do dashboard). Quando autorizado (`event = 7`): tenta
    `sessaoService.iniciarSessao(usuarioId, null, 'catraca')` (extraído de
    `sessoes.js` nesta entrega) pra ganhar de graça o auto-início de treino;
    se falhar por falta de treino atribuído (400 esperado, não é erro),
    ignora e segue. Em paralelo, sempre garante o registro de presença via
    `frequenciaService.registrarCheckin(usuarioId, 'catraca')` (mesma lógica
    de XP/sequência de `frequencias.js:9`, extraída pra reuso) —
    independente de o aluno ter treino ou finalizar a sessão depois, senão
    quem não tem treino atribuído nunca geraria frequência pela catraca.
    Duplicata no mesmo dia (já tem check-in) é engolida sem erro. Avança o
    cursor ao final.
  - `verificarSaude()` — heartbeat (login simples) nas duas catracas, resultado
    usado pelo dashboard e pela reconciliação diária.
  - `reconciliar()` — job diário: confere se cada linha `catraca_usuarios`
    ainda corresponde a um usuário `TEG-*` de verdade no equipamento
    (detecta reset de fábrica, exclusão manual etc.) e re-sincroniza quem
    estiver divergente.

## 3. Ganchos nos fluxos existentes

- `matriculas.js:10` (criação de matrícula, que já nasce `ativa`) →
  `sincronizarAluno` + `liberarAcesso`.
- `jobWorker.js:226` (marca `suspensa` além da tolerância) → adiciona
  `RETURNING usuario_id` e chama `bloquearAcesso` pra cada um.
- `webhooks.js:26`, `pagamentos.js:55`, `pagamentos.js:61` (reativa matrícula
  pra `ativa`) → `liberarAcesso`.
- Falhas de rede em qualquer gancho não bloqueiam a requisição principal:
  fica só logada (não propaga erro 500). Não há fila de retry dedicada pra
  isso (simplificação deliberada, evita inventar mais uma fila além da que
  já existe pro WhatsApp) — quem fecha o buraco é o `reconciliar()` diário,
  que compara `catraca_usuarios.grupo_ativo` contra `matriculas.status =
  'ativa'` de verdade e corrige qualquer divergência (libera quem deveria
  estar liberado e não está, bloqueia quem deveria estar bloqueado e não
  está). Pior caso: até 24h de atraso pra corrigir uma falha de rede pontual.
- `jobWorker.js` ganha um segundo `setInterval` mais curto (30-60s) rodando
  `processarNovosAcessos`, separado do ciclo de 5min já existente (que fica
  só com as automações de cobrança/whatsapp). `reconciliar()` roda 1x/dia.
- Tudo isso é pulado (`no-op`) se `configuracoes.catraca_ativa = false`.

## 4. Endpoints novos

- `GET /api/catraca/status` (admin/dono) — status das duas catracas (online/
  offline via `verificarSaude`), contagem de sincronizados/pendentes/erro,
  dados pro dashboard (cards + série horária dos últimos 3 dias a partir de
  `catraca_eventos`, feed dos últimos acessos). Novo arquivo
  `backend/src/routes/catraca.js`, mesmo padrão de módulo por domínio que
  `frequencias.js`/`matriculas.js`, montado em `/api/catraca` (não dentro de
  `admin.js`).
- `POST /api/catraca/:usuarioId/sincronizar` (admin/dono) — força re-sync
  manual (reenviar foto, recriar se necessário).
- `PATCH /api/configuracoes` — estende o endpoint já existente
  (`configuracoes.js:18`) com o campo `catraca_ativa`.

## 5. Dashboard (frontend)

Nova seção no admin (`admin/catraca.html` ou aba dentro de uma página
existente — decidir no plano de implementação), com o mesmo espírito visual
do dashboard nativo da iDFace (cards de contagem + gráfico "acessos por hora"
+ feed ao vivo), mas na identidade visual preto/branco já usada no resto do
admin, não no azul/escuro da Control iD:

- Cards: alunos sincronizados, rostos pendentes de cadastro presencial,
  acessos hoje, indicador online/offline por catraca (verde/vermelho, tipo o
  widget "Catraca Online / Database Online" do CloudGym).
- Gráfico de acessos por hora (últimos 3 dias), autorizados × negados × não
  identificados — a partir de `catraca_eventos`.
- Feed ao vivo dos últimos acessos (nome, horário, catraca, autorizado/negado).
- Botão manual "sincronizar agora" por aluno (reenviar foto/recriar).

## 6. Erros e casos de borda

- Catraca 1 e catraca 2 sempre recebem a mesma operação; se uma falhar, só
  ela é reprocessada (idempotência via `catraca_usuarios` por catraca).
- Foto rejeitada pelo equipamento (qualidade ruim, sem rosto detectável) →
  `face_status = 'pendente_presencial'`, aluno continua liberado no grupo de
  acesso mesmo sem rosto (recepção cadastra ao vivo depois).
- Check-in duplicado no mesmo dia (app + catraca) → segundo evento é
  ignorado silenciosamente (unique violation tratada como no-op, sem XP
  duplicado).
- Catraca 1 ou 2 offline → heartbeat marca offline no dashboard, escrita cai
  na fila de retry, leitura de eventos simplesmente não avança até voltar.

## 7. Testes

- `controlIdClient.test.js` — mocka HTTP, cobre login/reautenticação, CRUD
  genérico, erros de rede/autenticação.
- `catracaService.test.js` — `sincronizarAluno` (com/sem foto, idempotência),
  `liberarAcesso`/`bloquearAcesso`, `processarNovosAcessos` (dedupe, avanço
  de cursor, unique-violation engolida, aluno sem treino ainda gera
  frequência), `reconciliar`.
- `sessaoService.test.js` / `frequenciaService.test.js` — cobrem a extração
  de `iniciarSessao` (de `sessoes.js`) e do check-in (de `frequencias.js`);
  os testes existentes de `sessoes.test.js`/`frequencias.test.js` continuam
  passando sem alteração de comportamento (puro refactor de extração).
- Ganchos em `jobWorker.test.js`, `matriculas.test.js`, `pagamentos.test.js`,
  `webhooks.test.js` — cobrindo as chamadas novas (mockando `catracaService`).
- Sem acesso a equipamento real em CI — API sempre mockada. Validação real
  é manual, contra as duas catracas físicas, começando pelas contas de teste
  do rollout.

## Fora de escopo (decidido explicitamente)

- Migrar/deduplicar os ~4796 usuários históricos do CloudGym.
- Trocar o Modo de Operação das catracas (continuam em Modo iDCloud).
- Desligar o agente/app local do CloudGym.
- Suporte a múltiplas unidades/filiais (CloudGym tem "Unidades"; TEG é
  single-tenant hoje).
- Fechar 100% a lacuna do bloqueio duplo enquanto o CloudGym conviver com o
  TEG (ver "Limitação conhecida e aceita" acima).

## Próximos módulos do roadmap CloudGym (fora desta fatia)

CRM com pipeline de vendas → Marketing digital (white-label) → IA/agente
virtual → Rede social interna/gamificação (parte já existe: ranking, XP,
conquistas).

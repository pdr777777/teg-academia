# Financeiro / Cobrança Recorrente — Design

Data: 2026-07-12
Contexto: primeira fatia do trabalho de igualar o teg-academia ao painel admin do
CloudGym (plano Infinity, R$649,90) que a academia usa hoje, pra permitir vender
o sistema próprio como substituto. Ver análise completa do CloudGym na conversa
de origem (módulos: financeiro, CRM, catraca, marketing, IA, social/gamificação —
cada um vira seu próprio spec).

## Escopo desta fatia

Automatizar o ciclo de cobrança que hoje é 100% manual (pagamento nasce
`pendente` e um admin confirma na mão via `PATCH /pagamentos/:id/confirmar`),
deixando a estrutura pronta pra plugar um gateway de pagamento de verdade assim
que o dono da academia disponibilizar a conta.

**Single-tenant**: sistema é só pra essa academia por enquanto, não multi-tenant/revenda.

**Sem checkout/página de pagamento própria**: o pagamento acontece via link
enviado pelo WhatsApp (fluxo que o Pedro está construindo em paralelo) ou
presencialmente na recepção. Não construímos nenhuma tela de checkout.

## 1. Modelo de dados

- `pagamentos`: novas colunas
  - `gateway VARCHAR(30)` (nullable) — nome do gateway usado (ex: `'asaas'`), `NULL` = fluxo manual atual
  - `gateway_charge_id VARCHAR(100)` (nullable) — id da cobrança no gateway
  - `link_pagamento TEXT` (nullable) — URL do Pix/boleto gerado pelo gateway
  - `tentativa INTEGER NOT NULL DEFAULT 1`
- `matriculas`: sem mudança estrutural. Estados existentes já cobrem o fluxo:
  - `ativa` → em dia
  - `vencida` → atrasada, ainda com acesso normal no app (D+1 até o limite de tolerância)
  - `suspensa` → atrasada além da tolerância, funcionalidades premium bloqueadas no app
  - `cancelada` → inalterado
- Nova config `dias_tolerancia_bloqueio` (INTEGER, default 5) — dias de atraso até
  suspender. Fica na tabela `configuracoes` já existente (feature de tema/metas),
  editável pelo dono.

## 2. Adaptador de gateway (`backend/src/services/gateway/`)

- `gatewayAdapter.js` — interface: `criarCobranca({ valor, vencimento, usuario })`
  → `{ gateway_charge_id, link_pagamento }`; `processarWebhook(payload)` →
  `{ gateway_charge_id, status }` normalizado (`'pago'` | `'cancelado'`).
- `manualAdapter.js` — implementação ativa por padrão: não chama API nenhuma,
  mantém o comportamento atual (pagamento `pendente` sem link, confirmado à mão
  pelo admin).
- `index.js` — seleciona o adapter via env var `PAYMENT_GATEWAY` (default
  `manual`). Trocar de gateway = implementar `<nome>Adapter.js` com a mesma
  interface + mudar a env var. Nenhuma rota/lógica de negócio muda.
- `POST /api/webhooks/pagamento` (pública, sem auth, valida assinatura do
  gateway) — recebe confirmação e atualiza pagamento via `gateway_charge_id`.
  Inerte (404) enquanto o adapter for `manual`.

## 3. Automação do ciclo de cobrança (estende `jobWorker.js`)

Adiciona ao `agendarAutomacoes()` (já roda a cada 5min via `setInterval`):

- **Geração da próxima cobrança**: no vencimento (D0) de uma matrícula `ativa`,
  chama `gatewayAdapter.criarCobranca` pra gerar o próximo ciclo (novo registro
  em `pagamentos`, estende `data_vencimento` da matrícula pelo `duracao_dias`
  do plano).
- **Job `whatsapp_cobranca_gerada`**: dispara assim que a cobrança nasce,
  manda o `link_pagamento` (ou aviso "procure a recepção" se adapter manual).
- **Lembrete de vencimento** (`whatsapp_vencimento`, D-3): já existe, mantido.
- **Job novo `whatsapp_atraso`**: D+1 em diante, repete a cada 2 dias até
  pagamento ou suspensão — segue o padrão de dedup já usado (checar
  `automacoes_log` antes de reenviar).
- **Transição de estado automática**:
  - D+1 até `dias_tolerancia_bloqueio`: matrícula → `vencida`
  - Além do limite: matrícula → `suspensa`
  - Pagamento confirmado (manual ou webhook): matrícula volta a `ativa` na hora

Tudo reaproveitando o padrão existente no `jobWorker.js` (fila `jobs`, dedup via
`automacoes_log`), sem cron novo.

## 4. Separação matrícula × conta de login

Dois eixos independentes, não confundir:

- **Conta de login** (`usuarios.ativo`, `role`) — controla acesso ao sistema,
  gerido manualmente pelo admin/equipe, sem relação com pagamento.
- **Matrícula/cobrança** (`matriculas.status`) — controla só funcionalidades
  premium dentro do app (treino, aula, ranking) por atraso de pagamento. Login
  continua funcionando mesmo com matrícula `suspensa` — o aluno precisa
  conseguir entrar pra ver o que deve e pagar.

## 5. Endpoints

- `POST /api/webhooks/pagamento` — novo, recebe confirmação do gateway
- `GET /api/admin/financeiro` — já existe; adiciona `inadimplentes_detalhe`
  (lista de quem está `vencida`/`suspensa`) e `dias_tolerancia_bloqueio`
- `PATCH /api/admin/configuracoes/financeiro` — novo, dono ajusta
  `dias_tolerancia_bloqueio`

## 6. Frontend

- `frontend/perfil.html`/`perfil.js`: card "Minha assinatura" — status da
  matrícula + histórico de pagamentos via `/api/pagamentos/meus` (endpoint já
  existe, sem uso em tela ainda). **Somente informativo, sem botão de pagar**
  — pagamento acontece fora do site (WhatsApp/recepção).
- `admin/financeiro.html`: lista de inadimplentes com ação rápida de confirmar
  pagamento manual (reaproveita `admin-financeiro.js` existente).
- Banner de bloqueio reaproveitável no app do aluno quando matrícula =
  `suspensa`, avisando pendência (sem link de pagamento embutido).

## Fora de escopo (próximas fases, mantendo paridade com roadmap do CloudGym)

- Cartão recorrente / tokenização de cartão
- NF-e automática
- Open Finance / conciliação de recebíveis
- Certificação PCI DSS
- Split de pagamento multi-tenant (caso vire produto pra revender)
- Checkout/página de pagamento própria (decidido explicitamente fora — fluxo é
  via WhatsApp/recepção)

## Outros módulos do CloudGym (fora desta fatia, ordem sugerida depois desta)

CRM com pipeline de vendas → Controle de acesso/catraca → Marketing digital
(white-label) → IA/agente virtual → Rede social interna/gamificação (parte já
existe: ranking, XP, conquistas).

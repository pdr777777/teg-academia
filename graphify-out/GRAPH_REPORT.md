# Graph Report - .  (2026-07-20)

## Corpus Check
- 161 files · ~95,449 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 798 nodes · 1091 edges · 87 communities (53 shown, 34 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 106 edges (avg confidence: 0.67)
- Token cost: 550,636 input · 0 output

## Community Hubs (Navigation)
- Catraca (Control iD) - Servico e Config
- Job Worker e Automacoes
- Financeiro - Cobranca Recorrente
- Dependencias do Backend
- Auth Middleware e Indicacoes
- Dashboard do Aluno (UI)
- Alunos e Aulas - Dialogs Admin
- Rota de Matriculas
- Server e Registro de Rotas
- Admin Liquid Glass - Design System
- Capacitor - App Nativo
- Testes de Admin
- Testes de Aulas e Treinos
- Middleware de Erro e Log
- Paginas Admin - CRM e Exercicios
- Import CloudGym - Migracao de Dados
- Testes de Notificacoes
- Testes de Configuracoes e Frequencias
- Config de Banco de Dados (Pool)
- Rota de Alunos
- Rota Admin
- Rota de Pagamentos
- Automacao de Cobranca e Gateway
- Testes de Auth
- Rota de Equipe
- Bloqueio de Acesso e Notificacoes WhatsApp
- Visao Geral do Monorepo
- Runner de Migrations
- Rota de Ranking
- Rota de Planos
- Rota de Aulas
- Rota de Catraca
- Testes de Catraca
- Rota de Frequencias
- Rota de Leads
- Testes de Matriculas
- Metricas Prometheus
- Rota de Configuracoes
- Testes de Equipe
- Rota de Indicacoes
- Testes de Indicacoes
- Testes de Planos
- Testes de Ranking
- Rota de Treinos
- Testes de WhatsApp
- Migration - Integridade e Indices
- Migration - Schema da Catraca
- Testes do Server
- Migration - Sessoes de Treino e XP
- Migration - Financeiro Recorrente
- Middleware de Request ID
- Testes de Webhooks
- Migration - Conquistas
- Migration - Leads
- Migration - Automacoes e Jobs
- Config MCP
- CORS - Origens Permitidas
- CI - Build iOS
- Migration - Usuarios (Base)
- Migration - Planos (Base)
- Migration - Matriculas (Base)
- Migration - Pagamentos (Base)
- Migration - Frequencias (Base)
- Migration - Exercicios (Base)
- Migration - Treinos (Base)
- Migration - Treino-Exercicios
- Migration - Treino-Alunos
- Migration - XP Log (Base)
- Migration - Indicacoes (Base)
- Migration - Aulas (Base)
- Migration - Reset de Senha
- Migration - Indicacoes (Indicado ID)
- Migration - Configuracoes (Base)
- Migration - Automacao de Reativacao
- Migration - Mensagens de Lead
- Migration - Matriculas updated_at
- Migration - Reconciliacao de Automacoes
- Migration - Imagem de Exercicios (Add)
- Migration - Notificacoes WhatsApp (Flag)
- Migration - Bloqueio de Login
- Migration - Usuarios Control iD
- Migration - Usuarios Origem Externa
- Pagina de Relatorio (stub)
- Pagina de Suporte (stub)

## God Nodes (most connected - your core abstractions)
1. `criarUsuario()` - 24 edges
2. `gerarToken()` - 18 edges
3. `authMiddleware()` - 17 edges
4. `requireRole()` - 12 edges
5. `catracasConfiguradas()` - 12 edges
6. `criarPlano()` - 12 edges
7. `criarMatricula()` - 10 edges
8. `main()` - 9 edges
9. `enviar()` - 9 edges
10. `Dashboard do Aluno (dashboard.html)` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Backend CI GitHub Actions Workflow` --conceptually_related_to--> `Sequential SQL migrations convention (database/migrations, schema_migrations table)`  [INFERRED]
  .github/workflows/backend-ci.yml → README.md
- `Apresentação TEG Academia Digital (Canva deck)` --conceptually_related_to--> `Academia TEG monorepo overview`  [INFERRED]
  APRESENTACAO.md → README.md
- `.app-shell .sidebar / .card glass material` --semantically_similar_to--> `.glass reusable material class (frontend/assets/css/liquid-glass.css)`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-07-14-admin-liquid-glass.md → docs/superpowers/plans/2026-07-14-dashboard-liquid-glass.md
- `icons.js stroke-width 1.9 + settings/shield/bell icons added` --semantically_similar_to--> `icons.js — 44 icons swapped to real Coolicons SVG paths`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-07-14-dashboard-liquid-glass.md → docs/superpowers/plans/2026-07-20-admin-dashboard-coolicons.md
- `Integração Catraca Control iD — Implementation Plan` --references--> `Controle de Acesso / Catraca (Control iD) — Design spec`  [INFERRED]
  docs/superpowers/plans/2026-07-18-catraca-control-id.md → docs/superpowers/specs/2026-07-18-catraca-control-id-design.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CloudGym feature-parity roadmap phases (financeiro → catraca → admin menu structure)** — docs_superpowers_specs_2026_07_12_financeiro_cobranca_recorrente_design_cloudgym_paridade_roadmap, docs_superpowers_specs_2026_07_12_financeiro_cobranca_recorrente_design_design, docs_superpowers_specs_2026_07_18_catraca_control_id_design_design, docs_superpowers_specs_2026_07_19_admin_menu_cloudgym_design_design [INFERRED 0.85]
- **Shared liquid-glass visual material system across admin panel and aluno dashboard** — docs_superpowers_plans_2026_07_14_dashboard_liquid_glass_liquid_glass_css_glass, docs_superpowers_plans_2026_07_14_admin_liquid_glass_sidebar_card_glass, docs_superpowers_plans_2026_07_14_dashboard_liquid_glass_dashboard_html_markup, docs_superpowers_plans_2026_07_14_admin_liquid_glass_app_shell_palette_vars [INFERRED 0.80]
- **Catraca access-control sync/reconciliation closed loop (create, toggle, poll, correct drift)** — docs_superpowers_plans_2026_07_18_catraca_control_id_sincronizaraluno, docs_superpowers_plans_2026_07_18_catraca_control_id_liberaracesso_bloquearacesso, docs_superpowers_plans_2026_07_18_catraca_control_id_processarnovosacessos, docs_superpowers_plans_2026_07_18_catraca_control_id_reconciliar, docs_superpowers_plans_2026_07_18_catraca_control_id_teg_prefix_convention [INFERRED 0.85]
- **Shared Admin Shell Layout (Sidebar Nav, Icons, Theme Toggle)** — frontend_admin_alunos_page, frontend_admin_aulas_page, frontend_admin_automation_flow_page, frontend_admin_catraca_page, frontend_admin_configuracoes_page, frontend_admin_crm_page, frontend_admin_equipe_page, frontend_admin_exercicios_page, frontend_admin_financeiro_page, frontend_admin_frequencia_page, frontend_admin_index_page, frontend_admin_marketing_digital_page, frontend_admin_monitor_treino_page, frontend_admin_pagamentos_page, frontend_admin_planos_page, frontend_admin_ponto_de_venda_page, frontend_admin_ranking_page, frontend_admin_relatorio_page, frontend_admin_suporte_page, frontend_admin_treinos_page [INFERRED 0.85]
- **"Em Construção" Placeholder Stub Pages** — frontend_admin_automation_flow_page, frontend_admin_exercicios_page, frontend_admin_marketing_digital_page, frontend_admin_monitor_treino_page, frontend_admin_ponto_de_venda_page, frontend_admin_relatorio_page, frontend_admin_suporte_page [INFERRED 0.90]
- **Aluno Enrollment Flow: Plano + Pagamento + Cadastro Facial** — frontend_admin_alunos_dialog_adicionar_aluno, frontend_admin_planos_page, frontend_admin_pagamentos_modal_confirmar, frontend_admin_alunos_verificacao_facial, frontend_admin_catraca_page [INFERRED 0.85]
- **Fluxo de Autenticação (login / criar conta / esqueci senha / redefinir senha)** — frontend_login_page, frontend_registro_page, frontend_esqueci_senha_page, frontend_redefinir_senha_page [EXTRACTED 1.00]
- **Área do Aluno - Casca Compartilhada (dashboard/treinos/ranking/indicacao/perfil com nav inferior comum)** — frontend_dashboard_page, frontend_treinos_page, frontend_ranking_page, frontend_indicacao_page, frontend_perfil_page [EXTRACTED 1.00]
- **Funil de Conversão: Landing -> Matrícula -> Login/Dashboard** — frontend_index_page, frontend_matricula_page, frontend_login_page, frontend_dashboard_page [INFERRED 0.85]

## Communities (87 total, 34 thin omitted)

### Community 0 - "Catraca (Control iD) - Servico e Config"
Cohesion: 0.07
Nodes (39): catracasConfiguradas(), { criarClienteCatraca }, CatracaAuthError, CatracaOfflineError, criarClienteCatraca(), { criarClienteCatraca, CatracaOfflineError }, novoCliente(), bloquearAcesso() (+31 more)

### Community 1 - "Job Worker e Automacoes"
Cohesion: 0.06
Nodes (34): agendarAutomacoes(), catracaService, executarJobsPendentes(), { getGatewayAdapter }, logger, pool, processarJob(), processarNovosAcessosSeAtivo() (+26 more)

### Community 2 - "Financeiro - Cobranca Recorrente"
Cohesion: 0.05
Nodes (45): GET /api/admin/financeiro — inadimplentes_detalhe + dias_tolerancia_bloqueio, configuracoes.dias_tolerancia_bloqueio (default 5), Payment gateway adapter pattern (backend/src/services/gateway/), Financeiro / Cobrança Recorrente — Implementation Plan, Separation of login account (usuarios.ativo) vs matrícula/billing status (matriculas.status), frontend/admin/catraca.html — status cards, hourly chart, live feed, GET /api/catraca/status, POST /api/catraca/:usuarioId/sincronizar, catracasConfiguradas() — reads CATRACA1_*/CATRACA2_* env vars (+37 more)

### Community 3 - "Dependencias do Backend"
Cohesion: 0.05
Nodes (40): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, bcryptjs, cors, dotenv, express, express-rate-limit (+32 more)

### Community 4 - "Auth Middleware e Indicacoes"
Cohesion: 0.06
Nodes (33): { authMiddleware }, bcrypt, crypto, express, jwt, pool, router, whatsappService (+25 more)

### Community 5 - "Dashboard do Aluno (UI)"
Cohesion: 0.07
Nodes (37): Banner de Bloqueio de Acesso (bloqueio-banner), Navegação Inferior do Aluno (bottom-nav), Painel de Configurações (conta/segurança/notificações/aparência/ajuda), Conquistas Recentes (lista-conquistas, dashboard), Formulário Trocar Senha (form-senha, dashboard), Dashboard do Aluno (dashboard.html), Painel de Estatísticas (sequência, frequência, treinos, XP/nível), Card Treino de Hoje (dash-treino-hero) (+29 more)

### Community 6 - "Alunos e Aulas - Dialogs Admin"
Cohesion: 0.07
Nodes (36): Dialog Adicionar Aluno (Wizard Dados/Plano/Facial), Dialog Matricular Aluno, Dialog Novo Cliente, Alunos Page (Student Management), Verificação de Cadastro Facial na Catraca, Dialog Nova/Editar Aula, Aulas Page (Class Schedule), Tabela de Aulas (+28 more)

### Community 7 - "Rota de Matriculas"
Cohesion: 0.07
Nodes (24): { authMiddleware, requireRole }, catracaService, express, logger, pool, router, whatsappService, xpService (+16 more)

### Community 8 - "Server e Registro de Rotas"
Cohesion: 0.07
Nodes (29): adminRoutes, alunosRoutes, app, aulasRoutes, authRoutes, catracaRoutes, configuracoesRoutes, cors (+21 more)

### Community 9 - "Admin Liquid Glass - Design System"
Cohesion: 0.08
Nodes (27): .admin-dialog glass modal (backdrop stays solid), .app-shell brand palette CSS variables (--color-primary/-wine/-coral), .kanban-col / .kanban-card glass (card less transparent than column), Admin Liquid Glass — Implementation Plan, .app-shell .sidebar / .card glass material, .app-shell .table-wrap glass (overflow-x preserved), dashboard.css new layout (sidebar/stats/drawer/toggle-glass), dashboard.html new markup (sidebar, drawer, .glass elements) (+19 more)

### Community 10 - "Capacitor - App Nativo"
Cohesion: 0.08
Nodes (24): @capacitor/android, @capacitor/assets, @capacitor/cli, @capacitor/core, @capacitor/haptics, @capacitor/ios, @capacitor/splash-screen, dependencies (+16 more)

### Community 11 - "Testes de Admin"
Cohesion: 0.11
Nodes (20): app, catracaService, { criarUsuario, criarPlano, criarMatricula, gerarToken }, pool, request, app, { criarUsuario, criarPlano, criarMatricula, gerarToken }, pool (+12 more)

### Community 12 - "Testes de Aulas e Treinos"
Cohesion: 0.13
Nodes (17): app, { criarUsuario, criarAula, gerarToken }, pool, request, app, {
  criarUsuario, criarExercicio, criarTreino, criarTreinoExercicio, atribuirTreino, gerarToken,
}, pool, request (+9 more)

### Community 13 - "Middleware de Erro e Log"
Cohesion: 0.12
Nodes (13): logger, logger, redigirSegredoNoPath(), requestLogger(), dispararRequisicao(), logger, requestLogger, catracaService (+5 more)

### Community 14 - "Paginas Admin - CRM e Exercicios"
Cohesion: 0.12
Nodes (20): Tabela de Alunos, Automation Flow Page, Kanban Board do Funil de Vendas, CRM Page, Exercício Page (Biblioteca de Exercícios), Cards de Frequência, Frequência Page, Tabela de Frequência (Dias sem treinar) (+12 more)

### Community 15 - "Import CloudGym - Migracao de Dados"
Cohesion: 0.19
Nodes (15): bcrypt, crypto, deduplicaPorCpfOuEmail(), main(), mapeiaPlano(), normalizaCpf(), normalizaEmail(), normalizaTelefone() (+7 more)

### Community 16 - "Testes de Notificacoes"
Cohesion: 0.15
Nodes (9): app, { criarUsuario, criarTreino, atribuirTreino }, pool, request, app, {
  criarUsuario, criarExercicio, criarTreino, criarTreinoExercicio, atribuirTreino, gerarToken,
}, pool, request (+1 more)

### Community 17 - "Testes de Configuracoes e Frequencias"
Cohesion: 0.18
Nodes (9): app, { criarUsuario, gerarToken }, pool, request, app, { criarUsuario, gerarToken }, pool, request (+1 more)

### Community 18 - "Config de Banco de Dados (Pool)"
Cohesion: 0.20
Nodes (6): { Pool }, pool, app, { criarUsuario, gerarToken }, pool, request

### Community 19 - "Rota de Alunos"
Cohesion: 0.25
Nodes (6): jwt, pool, { authMiddleware }, express, pool, router

### Community 20 - "Rota Admin"
Cohesion: 0.25
Nodes (7): { authMiddleware, requireRole }, catracaService, express, logger, pool, router, xpService

### Community 21 - "Rota de Pagamentos"
Cohesion: 0.25
Nodes (7): { authMiddleware, requireRole }, catracaService, express, logger, pool, router, xpService

### Community 22 - "Automacao de Cobranca e Gateway"
Cohesion: 0.25
Nodes (8): agendarAutomacoes() — schedules WhatsApp reminders incl. atraso, backend/src/testUtils/fixtures.js (criarUsuario/criarPlano/criarMatricula/gerarToken), getGatewayAdapter() — selects adapter via PAYMENT_GATEWAY env var, manualAdapter (default payment adapter, no external calls), PATCH /api/pagamentos/:id/confirmar — extends matricula on auto-generated charge, processarVencimentos() — generates renewal charge, applies gradual block, startJobWorker() — 5-minute setInterval orchestrator, POST /api/webhooks/pagamento

### Community 23 - "Testes de Auth"
Cohesion: 0.29
Nodes (5): app, { criarUsuario, gerarToken }, crypto, pool, request

### Community 24 - "Rota de Equipe"
Cohesion: 0.29
Nodes (6): { authMiddleware, requireRole }, bcrypt, express, pool, ROLES_EQUIPE, router

### Community 25 - "Bloqueio de Acesso e Notificacoes WhatsApp"
Cohesion: 0.29
Nodes (7): GET /api/alunos/dashboard, /perfil — expose matricula_status even when vencida/suspensa, Card 'Minha assinatura' (perfil.html, read-only), renderBloqueioBanner(containerId, dados) — app-effects.js, GET/PATCH /api/alunos/perfil — notificacoes_whatsapp field, dashboard.js carregarDashboard()/config drawer wiring (rewrite), jobWorker gates WhatsApp sends on notificacoes_whatsapp = TRUE, usuarios.notificacoes_whatsapp BOOLEAN DEFAULT TRUE (migration 025)

### Community 26 - "Visao Geral do Monorepo"
Cohesion: 0.33
Nodes (6): Apresentação TEG Academia Digital (Canva deck), Backend CI GitHub Actions Workflow, Academia TEG monorepo overview, AI-powered lead response via ANTHROPIC_API_KEY, Sequential SQL migrations convention (database/migrations, schema_migrations table), WhatsApp Business Cloud API integration (optional, logs to console if unset)

### Community 27 - "Runner de Migrations"
Cohesion: 0.33
Nodes (4): fs, migrationsDir, path, pool

### Community 28 - "Rota de Ranking"
Cohesion: 0.33
Nodes (5): authMiddleware(), { authMiddleware }, express, pool, router

### Community 29 - "Rota de Planos"
Cohesion: 0.33
Nodes (5): requireRole(), { authMiddleware, requireRole }, express, pool, router

### Community 30 - "Rota de Aulas"
Cohesion: 0.33
Nodes (5): { authMiddleware, requireRole }, DIAS, express, pool, router

### Community 31 - "Rota de Catraca"
Cohesion: 0.33
Nodes (5): { authMiddleware, requireRole }, catracaService, express, pool, router

### Community 32 - "Testes de Catraca"
Cohesion: 0.33
Nodes (5): app, catracaService, { criarUsuario, gerarToken }, pool, request

### Community 33 - "Rota de Frequencias"
Cohesion: 0.33
Nodes (5): { authMiddleware, requireRole }, express, frequenciaService, pool, router

### Community 34 - "Rota de Leads"
Cohesion: 0.33
Nodes (5): { authMiddleware, requireRole }, express, PIPELINE_ETAPAS, pool, router

### Community 35 - "Testes de Matriculas"
Cohesion: 0.33
Nodes (5): app, catracaService, { criarUsuario, criarPlano, criarMatricula, gerarToken }, pool, request

### Community 36 - "Metricas Prometheus"
Cohesion: 0.40
Nodes (4): client, httpRequestDuration, metricsMiddleware(), register

### Community 37 - "Rota de Configuracoes"
Cohesion: 0.40
Nodes (4): { authMiddleware, requireRole }, express, pool, router

### Community 38 - "Testes de Equipe"
Cohesion: 0.40
Nodes (4): app, { criarUsuario, gerarToken }, pool, request

### Community 39 - "Rota de Indicacoes"
Cohesion: 0.40
Nodes (4): { authMiddleware }, express, pool, router

### Community 40 - "Testes de Indicacoes"
Cohesion: 0.40
Nodes (4): app, { criarUsuario, gerarToken }, pool, request

### Community 41 - "Testes de Planos"
Cohesion: 0.40
Nodes (4): app, { criarUsuario, criarPlano, gerarToken }, pool, request

### Community 42 - "Testes de Ranking"
Cohesion: 0.40
Nodes (4): app, { criarUsuario, gerarToken }, pool, request

### Community 43 - "Rota de Treinos"
Cohesion: 0.40
Nodes (4): { authMiddleware, requireRole }, express, pool, router

### Community 44 - "Testes de WhatsApp"
Cohesion: 0.40
Nodes (3): app, crypto, request

### Community 45 - "Migration - Integridade e Indices"
Cohesion: 0.50
Nodes (4): aulas, indicacoes, matriculas, pagamentos

### Community 46 - "Migration - Schema da Catraca"
Cohesion: 0.40
Nodes (4): catraca_cursor, catraca_eventos, catraca_usuarios, configuracoes

### Community 47 - "Testes do Server"
Cohesion: 0.50
Nodes (3): app, pool, request

### Community 48 - "Migration - Sessoes de Treino e XP"
Cohesion: 0.67
Nodes (3): treino_sessao_series, treino_sessoes, xp_log

### Community 49 - "Migration - Financeiro Recorrente"
Cohesion: 0.50
Nodes (3): automacoes_log, configuracoes, pagamentos

## Knowledge Gaps
- **422 isolated node(s):** `node`, `name`, `version`, `main`, `start` (+417 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `criarUsuario()` connect `Testes de Configuracoes e Frequencias` to `Testes de Catraca`, `Job Worker e Automacoes`, `Catraca (Control iD) - Servico e Config`, `Testes de Matriculas`, `Testes de Equipe`, `Testes de Indicacoes`, `Testes de Planos`, `Testes de Ranking`, `Testes de Admin`, `Testes de Aulas e Treinos`, `Testes de Notificacoes`, `Config de Banco de Dados (Pool)`, `Testes de Auth`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `authMiddleware()` connect `Rota de Ranking` to `Rota de Frequencias`, `Rota de Leads`, `Auth Middleware e Indicacoes`, `Rota de Configuracoes`, `Rota de Indicacoes`, `Rota de Matriculas`, `Rota de Treinos`, `Rota de Alunos`, `Rota Admin`, `Rota de Pagamentos`, `Rota de Equipe`, `Rota de Planos`, `Rota de Aulas`, `Rota de Catraca`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `node`, `name`, `version` to the rest of the system?**
  _422 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Catraca (Control iD) - Servico e Config` be split into smaller, more focused modules?**
  _Cohesion score 0.06745098039215686 - nodes in this community are weakly interconnected._
- **Should `Job Worker e Automacoes` be split into smaller, more focused modules?**
  _Cohesion score 0.06464646464646465 - nodes in this community are weakly interconnected._
- **Should `Financeiro - Cobranca Recorrente` be split into smaller, more focused modules?**
  _Cohesion score 0.05454545454545454 - nodes in this community are weakly interconnected._
- **Should `Dependencias do Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
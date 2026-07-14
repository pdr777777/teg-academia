# Redesign do dashboard do aluno — liquid glass TEG

## Contexto

O aluno pediu pra clonar a composição visual do StepWise (dashboard de fitness
tracker no Behance) no `dashboard.html`, com as cores/identidade da TEG e um
material "liquid glass" no estilo Apple (vidro claro, brilho especular,
squircle). Validado por 3 rodadas de mockup no companion visual do
brainstorming. Também pediu um painel de configurações e um pacote de ícones
consistente aplicado no site inteiro.

## Escopo

1. Redesenhar `dashboard.html` com sidebar liquid glass + painéis mapeados
   pra dado real da TEG.
2. Painel de configurações (drawer), acessível pela sidebar.
3. Atualizar `icons.js` pra um estilo mais consistente (peso de traço,
   squircle) inspirado no coolicons, aplicado no site inteiro — não só no
   dashboard.

## Fora de escopo

- Sidebar nas outras páginas (treinos, ranking, indicação, perfil) — elas
  continuam com o topnav atual até decidirmos migrar o resto depois.
- Painéis do StepWise sem equivalente real: calorias/batimento/passos
  literais (viram sequência/frequência/treinos), mapa de corrida, meal plan
  (vira "próxima aula").
- Seções genéricas do prompt de configurações que não se aplicam à TEG: 2FA,
  biometria, dispositivos conectados, contas vinculadas (OAuth), privacidade
  avançada, dados/armazenamento, "Sistema" (é desktop), assinatura/pagamento
  (fica pra frente separada do financeiro).
- Arquivo real do coolicons (o zip do usuário só tinha screenshots da página
  de marketing, não os SVGs) — em vez disso, `icons.js` é ajustado pra bater
  com o *visual* do coolicons.

## Sistema visual — material de vidro

Classe `.glass` reutilizável (extensão de `dashboard.css` ou novo
`liquid-glass.css`):

- `border-radius: 24px` (squircle), fundo
  `linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.012) 55%)`
- `backdrop-filter: blur(20px) saturate(150%)`
- Borda `1px solid rgba(255,255,255,.08)`
- `box-shadow`: inset highlight sutil no topo + sombra externa escura
- `::after` — blob especular (radial-gradient branco, `mix-blend-mode:
  screen`, baixa opacidade) posicionado embaixo-esquerda, léve blur
- `::before` — sweep de tinta de marca (laranja→vinho, `mix-blend-mode:
  overlay`, bem sutil) pra não perder a identidade TEG mesmo no vidro claro
- Variante `.glass.active-nav` — versão com mais saturação da tinta de marca,
  pra estado ativo da sidebar

Cores continuam as de `global.css` (`--color-primary: #ff8a00`,
`--color-wine`, `--color-coral`), fundo `--color-bg: #0a0a0a`. Nada de
paleta clara/lavanda do StepWise original.

## Layout do dashboard

**Sidebar** (só `dashboard.html`, `position: fixed` à esquerda):
- Logo TEG
- Nav: Dashboard (ativo), Treinos, Ranking, Indicação, Perfil — ícones do
  `icons.js`, cada item navega pra página existente (topnav lá continua)
- Rodapé: Configurações (abre o drawer), Sair (logout)

**Hero**: saudação + nome + badge do plano (dado existente: `saudacaoHora()`,
`d.nome`, `d.plano_nome`/`d.matricula_status`)

**Stats row** (4 cards `.glass`):
| Card | Visual | Dado |
|---|---|---|
| Sequência | anel conic-gradient | `d.sequencia_atual` sobre `Math.max(d.maior_sequencia, d.sequencia_atual, 7)` (evita anel cheio logo de cara pra quem tá começando) |
| Frequência da semana | sparkline/linha | dias treinados nos últimos 7 dias, derivado de `/api/frequencias/minha?mes=` (já buscado pro calendário — sem endpoint novo) |
| Treinos no total | mini-barras + número | `d.total_treinos` |
| Progresso de XP | anel conic-gradient | `calcXpLevel(d.xp).pct` (já calculado em `dashboard.js`) |

**Activity** (gráfico de barras Seg–Dom): mesma fonte de frequência da
semana acima, barra cheia = treinou, vazia = não treinou, destaque no dia
atual.

**Lower row**:
- Conquistas recentes (já existe: `d.conquistas_recentes`) — vira lista em
  vidro com ícone em vez de badge redondo simples
- "Hoje" — status do check-in de hoje + botão registrar treino (reaproveita
  `btn-checkin` existente)
- "Próxima aula" — calcula client-side a partir de `GET /api/aulas` (público,
  já existe) filtrando pelo dia/hora atual em diante

**Coluna direita**:
- Perfil: foto (`d.foto_url` com fallback), nome, chips de plano e
  vencimento — sem peso/altura (TEG não coleta)
- Calendário: mesmo grid de `calendario-grid` já existente, só re-estilizado
  em vidro
- Agenda da semana: lista de aulas da semana vinda do mesmo `GET /api/aulas`

## Painel de configurações

Drawer aberto pelo item "Configurações" da sidebar. Busca no topo (filtra
por texto os `setting-row` visíveis), navegação lateral por seção,
autosave com toast "Salvo" em vez de botão salvar.

**Seções:**

1. **Conta** — foto, nome, telefone, data de nascimento
   → `PATCH /api/alunos/perfil` (já existe, campos `nome`, `telefone`,
   `foto_url`, `data_nascimento`)
2. **Segurança** — trocar senha (senha atual + nova)
   → `PATCH /api/auth/senha` (já existe)
3. **Notificações** — toggle "Receber lembretes por WhatsApp"
   → **novo**: coluna `usuarios.notificacoes_whatsapp BOOLEAN NOT NULL
   DEFAULT TRUE` (migration nova) + incluir no `CAMPOS_PERMITIDOS` do
   `PATCH /api/alunos/perfil`. O job de cobrança/lembrete que usa
   `whatsappService.js` passa a checar essa coluna antes de enviar.
4. **Aparência** — tema claro/escuro/automático (reaproveita
   `data-theme-toggle` de `theme.js`; adicionar opção "automático" que segue
   `prefers-color-scheme`)
5. **Ajuda** — links estáticos (suporte, termos) — sem backend

## Ícones

Ajustar `icons.js`: aumentar levemente a espessura do traço (de 1.75 pra algo
mais próximo do coolicons, ~1.9–2), garantir cantos/joins consistentes
(`stroke-linecap: round`, `stroke-linejoin: round` já é padrão), revisar
ícones existentes pra manter esse peso. Adicionar os que faltam pro
dashboard novo: `settings`/gear, `shield` (segurança), `bell` (notificações),
`chevron-right` (já existe, usado na navegação do drawer). Aplicar essa
biblioteca de forma consistente nas páginas que ainda têm emoji ou ícone
fora do padrão (varrer o site, não só o dashboard).

## Responsividade

Abaixo de ~1024px: sidebar vira drawer deslizante (mesmo padrão do
`btn-mobile-menu` que já existe no topnav das outras páginas), acionado por
um botão de menu no topo da página. Grid de stats/lower row colapsa pra 2
colunas e depois 1 em telas pequenas.

## Arquivos afetados

- `frontend/dashboard.html` — marcação nova (sidebar, drawer de config)
- `frontend/assets/css/dashboard.css` (ou novo `liquid-glass.css`) — material
  de vidro, sidebar, drawer, novos componentes visuais
- `frontend/assets/js/dashboard.js` — cálculo de frequência semanal,
  próxima aula/agenda da semana a partir de `/api/aulas`, wiring do drawer
  de config
- `frontend/assets/js/icons.js` — ajuste de estilo + ícones novos
- `backend/database/migrations/0XX_notificacoes_whatsapp.sql` — nova coluna
- `backend/src/routes/alunos.js` — incluir `notificacoes_whatsapp` nos
  campos permitidos do PATCH
- `backend/src/services/whatsappService.js` (ou o job que dispara lembrete)
  — checar a preferência antes de enviar

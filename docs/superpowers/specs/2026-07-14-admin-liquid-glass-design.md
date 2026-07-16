# Liquid glass no painel admin

## Contexto

O dashboard do aluno (`frontend/dashboard.html`) ganhou um material "liquid glass" (blur + fundo com gradiente estático nas cores da marca), depois de duas rodadas: a primeira abandonada por bugs no WebView nativo, a segunda corrigindo essas causas. Nessa mesma conversa, o Matias trouxe o guia de identidade visual oficial da TEG (preto profundo `#121214`, vermelho principal `#B62929`, laranja destaque `#FF7A1A`, vermelho escuro `#7A1B1E`, cinza claro `#D0D0D0`, cinza médio `#8A8A8A`, branco `#FFFFFF`, gradiente recomendado `linear-gradient(135deg, #7A1B1E 0%, #B62929 50%, #FF7A1A 100%)`) e pediu pra aplicar essa paleta em vez da mistura laranja+vinho+coral que tinha ficado acastanhada.

Agora o pedido é levar o mesmo tratamento (vidro + paleta oficial) pro painel admin (`frontend/admin/*.html`, 12 páginas: Dashboard, Financeiro, Alunos, Ranking, Frequência, Treinos, Aulas, Planos, CRM, Pagamentos, Equipe, Configurações) — a área de trabalho do dono/equipe da academia, hoje com um visual bem diferente (flat, sidebar de 240px fixa, cards `.card` simples, gráficos em SVG/conic-gradient, quadro Kanban do CRM, tabelas).

## Escopo

1. Sidebar do admin (`.sidebar`) ganha o material de vidro.
2. Fundo com gradiente estático (mesma técnica do aluno: sem WebGL/animação) atrás de todo o `.app-shell`.
3. Todos os `.card` do admin (stat cards, cards de gráfico, listas, configurações) ganham vidro.
4. Tabelas (`.table-wrap`) ganham vidro no wrapper.
5. Kanban do CRM (`.kanban-col` e `.kanban-card`) ganham vidro.
6. Os dois padrões de modal existentes (`<dialog class="admin-dialog">`, usado na maioria das páginas, e `.modal-overlay`/`.modal-box`, usado só em `pagamentos.html`) ganham vidro na caixa de conteúdo — o backdrop/scrim continua escuro sólido (não vira vidro, senão perde a função de obscurecer a página atrás).
7. Paleta oficial da marca aplicada a **todo** o admin — gráficos (barra/linha/donut), badges de tendência, ícones de destaque, botões — via redefinição local de `--color-primary`/`--color-wine`/`--color-coral` dentro de `.app-shell` (ver "Sistema de cores" abaixo). Sem editar nenhum arquivo `.js`.
8. Elementos pequenos que precisam de contraste sólido pra legibilidade ficam **fora** do tratamento de vidro (fundo opaco continua): miolo do donut (`.donut-hole`), avatares (`.avatar-fallback`), thumbnails de exercício (`.exercicio-thumb`), pontinhos de dia de calendário (não aplicável aqui, é só referência ao padrão já usado no aluno).

Toda a implementação fica concentrada em `frontend/assets/css/admin.css` — como todas as 12 páginas já usam as mesmas classes (`.card`, `.table-wrap`, `.sidebar`, `.kanban-col`, etc.), não é necessário editar nenhuma das 12 páginas HTML nem nenhum arquivo JS.

## Fora de escopo

- `.chart-bar`/`.chart-bar-col` (CSS em `admin.css` linhas ~14-28) — confirmado como código morto (nenhum JS gera esses elementos hoje, `renderLineChart` em `app-effects.js` usa `.line-chart-*` no lugar). Não vou restilizar nem remover — é uma limpeza não relacionada a este trabalho.
- Mudar a cor global do site (`:root` em `global.css`) — a correção de paleta fica só dentro de `.app-shell`, não afeta landing, login, matrícula, perfil, ranking público do aluno nem o dashboard do aluno (que já tem sua própria correção de paleta, feita antes).
- Trocar o padrão de navegação do admin (sidebar fixa) por bottom nav — isso faz sentido pro aluno (app mobile-first), não pro admin (ferramenta de trabalho, desktop/tablet).
- Reestruturar `treinos.html` (layout de duas colunas com painel de detalhe alternado via `style.display` inline) — o `.card` recebe vidro normalmente nos dois estados, sem precisar mexer no JS que já alterna a visibilidade.

## Sistema de cores

Dentro de `.app-shell`, redefinir as variáveis de marca pros valores oficiais do guia:

```css
.app-shell {
  --color-primary: #FF7A1A;   /* laranja destaque */
  --color-primary-hover: #e56a10;
  --color-wine: #7A1B1E;      /* vermelho escuro */
  --color-coral: #B62929;     /* vermelho principal */
}
```

Como toda cor de gráfico/badge/botão no admin já resolve através dessas variáveis (`var(--color-primary)` etc., inclusive dentro do SVG gerado por `renderLineChart` e do array `DONUT_CORES` em `admin-financeiro.js`), essa redefinição local basta pra recolorir tudo — sem tocar em `.js`. Fora do `.app-shell` (landing, login, dashboard do aluno) as variáveis originais de `global.css` continuam valendo, intactas.

`--color-success`/`--color-warning`/`--color-danger` **não mudam** — são cores semânticas de status (pago/pendente/atrasado), não cores de marca.

## Material de vidro

Reaproveita a técnica já validada em `frontend/assets/css/liquid-glass.css` (fundo translúcido + `backdrop-filter: blur()` + brilho especular via `::after` + borda sólida semi-transparente + `-webkit-mask-image` pro recorte de canto no WebView), adaptada dentro de `admin.css` pros seletores do admin:

- `.app-shell .sidebar`
- `.app-shell .card` (cobre stat cards, cards de gráfico, listas, configurações — todos usam essa classe)
- `.app-shell .table-wrap`
- `.kanban-col`, `.kanban-card`
- `.admin-dialog`, `.modal-box`

Fundo do `.app-shell` (mesmo princípio do `.dash-shell::before` do aluno — gradiente estático, sem WebGL): degradê radial + linear nas cores oficiais (vermelho escuro → vermelho principal → laranja), `position: fixed`, atrás de tudo.

## Fora de escopo mas registrado como pendência

Assim como no dashboard do aluno, isso só será testado em navegador desktop. Diferente do aluno, o admin provavelmente não roda dentro do WebView do app nativo (Capacitor) — é acessado via navegador normal pelo dono/equipe — mas a técnica de `-webkit-mask-image` é mantida por consistência/segurança, sem custo real caso nunca seja necessária ali.

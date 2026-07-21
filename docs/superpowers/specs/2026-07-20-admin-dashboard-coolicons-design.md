# Dashboard admin — ícones Coolicons reais + refino visual (2026-07-20)

## Contexto

O admin (`frontend/admin/*`) e o dashboard do aluno (`frontend/dashboard.html`) já
usam um sistema próprio de ícones SVG inline (`assets/js/icons.js`), com ~79 ícones
desenhados à mão "inspirados no coolicons" (comentário no próprio arquivo). O usuário
quer trocar essa aproximação pelos ícones reais do pacote **Coolicons** (o "Free
Iconset" da comunidade do Figma) e, de quebra, dar um acabamento mais moderno/
minimalista à página de overview do dashboard admin (`frontend/admin/index.html`),
que foi a estrutura mais recente que o Pedro montou (stat-cards + gráfico de
faturamento).

Coolicons é um pacote real, gratuito e open-source, licença CC 4.0, com SVGs
individuais prontos: https://github.com/krystonschwarze/coolicons (440+ ícones).

## Escopo desta iteração

1. Substituir o conteúdo de cada entrada do mapa `ICONS` em `assets/js/icons.js`
   pelos paths reais do Coolicons, mantendo exatamente a mesma API
   (`Icons.icon(nome, {size, className})`, atributo `data-icon="nome"` +
   `fillIcons()`). Isso troca a "arte" por trás de todo ícone já usado no site
   (admin inteiro + dashboard do aluno + landing, ~61 nomes em uso hoje — lista
   completa a levantar via grep na hora do plano) sem tocar em HTML/JS que os
   consome.
2. Para nomes sem equivalente direto no Coolicons, escolher o ícone mais próximo
   semanticamente do pacote (documentar a escolha inline no `icons.js` via
   comentário só quando a equivalência não for óbvia).
3. Refinar visualmente `frontend/admin/index.html` (página "Dashboard"):
   - Ícone de cada stat-card (`admin-dashboard.js` → `CARDS`) passa a ser um badge
     circular com tint leve da cor semântica do card (verde/vermelho/neutro),
     em vez do ícone solto sem fundo.
   - Mais espaçamento interno nos cards e hierarquia tipográfica mais clara entre
     o número grande e o label.
   - **Correção após checar o CSS real** (a suposição original abaixo estava
     errada): o admin ainda usa `--color-primary` laranja (`#ff8a00`) nos ícones
     dos stat-cards e no gradiente do gráfico — só as telas de auth migraram pro
     monocromático até agora ([[teg-auth-identidade-visual-2026-07-17]]). Esta
     iteração **mantém o laranja atual do admin** (decisão do usuário); migrar o
     admin pro monocromático fica pra uma iteração própria, não agora.
4. Sem dependências novas: continua tudo SVG inline, sem build step, sem CDN.

## Fora de escopo

- Reescrita completa do layout (bento grid, novos widgets) — feita como reforma
  incremental sobre a estrutura atual, não reconstrução do zero.
- Outras páginas do admin (alunos, financeiro, catraca, etc.) e o dashboard do
  aluno recebem os ícones novos automaticamente (mesma função `Icons.icon`), mas
  não têm refino de layout nesta iteração — só a página de overview do admin.
- Ícone-fonte (webfont) ou sprite `<use href="#icone">` — ver design anterior:
  rejeitados por complexidade/acessibilidade piores que SVG inline com
  `currentColor`, sem ganho real para o tamanho do projeto.
- Os 2 emojis soltos encontrados no código (`matricula.js` badge "🔥", `treinos.js`
  toast "💪") — não fazem parte do dashboard admin, ficam de fora desta iteração.

## Fonte dos ícones

Puxar os arquivos SVG individuais do repositório oficial
(`github.com/krystonschwarze/coolicons`, pasta de SVGs), extrair o `path`/`stroke`
interno de cada um e colar no formato que `icons.js` já usa (miolo do `<svg>`, sem
a tag externa — a função `icon()` monta `<svg>` com `stroke="currentColor"`,
`stroke-width="1.9"` etc. por fora). Ajustar `stroke-width` dos paths originais se
necessário para bater com o peso visual (1.9) já usado no resto do site.

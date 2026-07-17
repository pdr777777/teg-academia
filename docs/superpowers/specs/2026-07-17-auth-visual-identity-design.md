# Auth pages — identidade visual (2026-07-17)

## Contexto

O sistema (dashboard e telas de auth) estava sendo descrito pelo usuário como "muito
feio", "sem identidade própria" e "com qualidade baixa de imagem". Para calibrar o que
isso significa na prática, analisamos 5 referências trazidas pelo usuário (Oryzo.ai,
Audemars Piguet, Bennett & Clive, Likova, Unseen Studio) via screenshots reais.

O padrão comum entre elas não é "tema escuro" nem "gradiente" — é:
1. Tipografia tratada como elemento gráfico central, não texto de apoio.
2. Imagem/render real e com luz intencional no lugar de ícone genérico.
3. Grão/textura de ruído sutil sobre fundos escuros (evita cara de "gradiente CSS liso").
4. Paleta contida (quase monocromática + 1 acento) e espaço negativo generoso.

## Escopo desta iteração

Aplicar os 4 princípios acima às 4 páginas de auth que compartilham `.auth-wrap` /
`.auth-card` (`login.html`, `registro.html`, `esqueci-senha.html`,
`redefinir-senha.html`), sem introduzir dependências novas (continua HTML/CSS/JS puro,
sem build step) e sem alterar lógica de formulário/JS existente.

Não há foto real da academia disponível ainda — o design usa tipografia + Lightfall +
grain como pilares agora, com um slot de background-image preparado para receber uma
foto real depois (troca de uma variável CSS, sem refatoração).

## Mudanças

1. **Fundo Lightfall** (já existe, usado no dashboard) — adicionar aos 4 HTMLs de auth
   via os 3 arquivos já existentes (`lightfall.css`, `lightfall-bg.js`,
   `lightfall-init.js`). Zero código novo.
2. **Grain overlay** — camada CSS nova (`::before` com SVG noise em `data:` URI,
   `mix-blend-mode: overlay`, opacidade baixa) aplicada em `.auth-wrap`. ~1 regra CSS,
   sem asset externo.
3. **Título como elemento gráfico** — `.auth-card h1` passa a usar `--font-display`
   (Bebas Neue) em escala bem maior (`clamp` similar ao `.section-head h2` do
   `global.css`), em vez do tamanho atual de card comum.
4. **Card com leve vidro** — `.auth-card` ganha fundo semi-transparente +
   `backdrop-filter: blur()` para deixar o Lightfall/grain vazarem atrás, mantendo
   contraste suficiente pro formulário.
5. **Inputs com ícone** — usar `icons.js` (`mail`, `lock`, `eye`/`unlock` já existentes)
   como ícone à esquerda dos campos de e-mail/senha + toggle de mostrar senha.

## Fora de escopo

- Dashboard e telas admin (fica pra próxima iteração — mencionado pelo usuário como
  "muito feio" mas tratado à parte por ser tela mais complexa/maior).
- Foto real da academia (aguardando asset do usuário).
- Layout de duas colunas (usuário optou pelo card centralizado, mudança mais rápida).

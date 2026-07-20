# Reestruturação do menu admin (paridade de estrutura com o CloudGym) — Fase 1

Data: 2026-07-19
Contexto: o Matias quer que o painel admin do TEG tenha a mesma estrutura de
navegação e ações que o CloudGym (sistema que a academia já usa e paga hoje),
pra vender pra TEG com pelo menos paridade do que ela já tem disponível. A
aparência (cores, estilo visual) é assunto de uma fase seguinte, fora deste
spec — aqui só entra estrutura/navegação. Ver [[teg-pendencias-2026-07-13-financeiro]]
pro roadmap mais amplo (CRM, catraca, marketing, IA).

Referência: screenshots do painel `app.cloudgym.io/cloudgym` (menu lateral +
tela de "Ficha de Treino" por aluno) e do dashboard admin atual do TEG,
mandados pelo Matias em 2026-07-19.

## Decisão de escopo

Essa reestruturação é grande demais pra uma entrega só (menu inteiro + várias
telas 100% novas: Ponto de venda, Automation Flow, Monitor de treino,
Marketing Digital, Relatório, Suporte, mais o redesenho completo da ficha de
treino por aluno). Fica dividida em fases, cada uma com seu próprio spec:

- **Fase 1 (este spec):** só a estrutura de navegação — menu lateral com
  todos os itens/submenus do CloudGym, nomes e ordem corretos, roteamento
  funcionando. Telas que ainda não existem no TEG ganham placeholder "em
  construção".
- **Fases seguintes:** uma spec por tela prioritária, construindo o conteúdo
  real de cada placeholder (a mais provável de vir primeiro é a Ficha de
  Treino por aluno, já que foi a tela mostrada em detalhe).

## Menu final (ordem e estrutura)

```
Dashboard
Alunos                          (ganha botão "Novo Cliente" em destaque)
Ponto de venda                  [novo — placeholder]
Aulas
Ficha de Treino ▾               [reestrutura "Treinos"]
  ├─ Exercício                  [novo — biblioteca de exercícios]
  ├─ Template                   [= tela atual de Treinos, renomeada]
  ├─ Automation Flow            [novo — placeholder]
  └─ Monitor de treino          [novo — placeholder]
Ranking
Frequência
Planos
Marketing Digital               [novo — placeholder]
Pipeline de Vendas              [= CRM, renomeado]
Financeiro
Faturas                         [= Pagamentos, renomeado]
Relatório                       [novo — placeholder]
Equipe
Configurações
Suporte                         [novo — placeholder]
```

Decisões que moldaram essa lista (confirmadas com o Matias):

- **Ranking, Frequência, Planos e Equipe são exclusivos do TEG** (o CloudGym
  não tem equivalente visível) — ficam mantidos no menu, encaixados perto de
  onde fazem sentido, em vez de forçar 1:1 com o CloudGym.
- **CRM → "Pipeline de Vendas"** e **Pagamentos → "Faturas"**: é renomeação de
  label/ícone só, a página e a rota por baixo continuam as mesmas
  (`crm.html`, `pagamentos.html`).
- **"Novo Cliente" não vira item de menu separado**: fica como um botão em
  destaque dentro da página `alunos.html`, em vez de um fluxo dedicado à
  parte como no CloudGym.
- **Ficha de Treino é um item expansível (submenu)**, não uma página só. A
  tela atual de `treinos.html` (montar treino + atribuir a aluno) passa a
  ser o submenu "Template" — mesmo arquivo/rota, só muda onde é alcançado a
  partir do menu.

## Estrutura técnica

Hoje cada uma das ~12 páginas admin (`index.html`, `treinos.html`,
`crm.html`, etc.) tem o `<nav class="sidebar-nav">...</nav>` inteiro
copiado e colado. Como o menu vai mudar bastante agora e de novo nas
próximas fases, a Fase 1 extrai isso pra um componente central:

- **`frontend/assets/js/sidebar-nav.js`** (novo arquivo): define a lista de
  itens do menu numa única config (rota, ícone, label, roles permitidas
  via `data-role-dono`/`data-role-adminup`, e filhos pro submenu de Ficha de
  Treino). Roda de forma síncrona no carregamento da página, injeta o HTML
  do menu dentro do `<aside class="sidebar" id="sidebar">` (que passa a
  vir vazio em cada página) e marca o item ativo comparando com o
  `location.pathname` atual. Chama `fillIcons()` (já existe em `ui.js`)
  no trecho injetado pra hidratar os ícones.
- Ordem de scripts nas páginas: `icons.js`, `ui.js`, `sidebar-nav.js` (nessa
  ordem, pra `fillIcons` já estar definido), depois os scripts que já
  existem (`api.js`, `app-effects.js`, `admin-guard.js`, script da página).
  `admin-guard.js` continua funcionando sem mudança: ele consulta
  `[data-role-dono]`/`[data-role-adminup]` dentro de uma promise (`fetch`
  assíncrono), então roda depois que `sidebar-nav.js` (síncrono) já injetou
  o menu.
- Submenu (Ficha de Treino) abre/fecha ao clicar, e já vem expandido se a
  página atual for uma das filhas dele.
- Ícones novos a adicionar em `icons.js`: `shopping-cart` (Ponto de venda),
  `megaphone` (Marketing Digital), `git-branch` (Automation Flow),
  `activity` (Monitor de treino), `receipt` (Faturas), `life-buoy`
  (Suporte), `file-text` (Relatório).
- Todas as páginas admin existentes trocam o bloco de nav hardcoded pelo
  `<aside class="sidebar" id="sidebar"></aside>` vazio + inclusão do script.
  É uma troca mecânica, sem alterar o HTML/CSS do restante da página.

## Páginas — o que muda em cada uma

| Página | Ação |
|---|---|
| `treinos.html` | Continua igual; só é alcançada agora via Ficha de Treino → Template |
| `crm.html` | Continua igual; label do menu vira "Pipeline de Vendas" |
| `pagamentos.html` | Continua igual; label do menu vira "Faturas" |
| `alunos.html` | Ganha botão "Novo Cliente" em destaque (ajusta o botão de cadastro que já existe) |
| `ponto-de-venda.html` | Nova — placeholder |
| `exercicios.html` | Nova — placeholder (biblioteca de exercícios, hoje só existe como dialog dentro de `treinos.html`) |
| `automation-flow.html` | Nova — placeholder |
| `monitor-treino.html` | Nova — placeholder |
| `marketing-digital.html` | Nova — placeholder |
| `relatorio.html` | Nova — placeholder |
| `suporte.html` | Nova — placeholder |

Todas as páginas novas usam o shell padrão (sidebar + `page-head`) e um card
central único: "Em construção — chegando em breve". Nenhuma rota de backend
nova é criada nesta fase.

## Fora de escopo (fica pras próximas fases)

- Conteúdo real de qualquer tela placeholder.
- Redesenho da ficha de treino por aluno (abas A-H, professor, sessões,
  avaliação física, exame médico, "Piloto Automático" com IA, tabela de
  exercícios com peso) — vira spec própria.
- Qualquer mudança visual/estética (cores, tipografia, "liquid glass" etc.)
  — combinado que aparência vem depois da estrutura.

## Teste

Checklist manual (não há teste automatizado de UI no projeto hoje):

- Cada página admin carrega o menu completo, na ordem certa, com o item
  ativo destacado.
- Submenu de Ficha de Treino abre/fecha e mantém-se expandido quando uma
  das páginas filhas está ativa.
- Login como `dono`, `admin` e `professor` — itens com
  `data-role-dono`/`data-role-adminup` continuam escondidos/mostrados
  corretamente (mesmo comportamento de hoje, só que vindo do menu injetado).
- As 7 páginas novas abrem sem erro no console e mostram o placeholder.

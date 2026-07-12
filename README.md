# Academia TEG

Monorepo do site da Academia TEG: landing page + matrícula online + área do
aluno gamificada (XP, sequência, ranking, conquistas) + CRM de leads +
automações de WhatsApp (lembrete de ausência, vencimento, aniversário).

## Estrutura

```
frontend/   HTML/CSS/JS puro (landing, matrícula, dashboard do aluno, admin)
backend/    API REST em Node.js + Express + PostgreSQL
database/   Migrations SQL (rodam em ordem, 001 → 016)
```

## Stack

- **Backend**: Node.js, Express, PostgreSQL (`pg`), JWT (`jsonwebtoken`),
  `bcryptjs`, `helmet`, `express-rate-limit`
- **Banco**: PostgreSQL (Supabase)
- **Frontend**: HTML/CSS/JS estático, sem build step — consome a API via
  `frontend/assets/js/api.js`

## Setup local

### 1. Banco de dados

Crie um projeto no [Supabase](https://supabase.com) (ou use um PostgreSQL
local) e pegue a connection string.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# preencha DATABASE_URL e JWT_SECRET (mín. 32 caracteres) no .env
npm run migrate   # aplica as migrations em database/migrations, em ordem
npm run dev        # sobe em http://localhost:3001
```

Variáveis de ambiente (`backend/.env`):

| Variável | Descrição |
|---|---|
| `PORT` | Porta do servidor (default 3001) |
| `DATABASE_URL` | Connection string do PostgreSQL |
| `JWT_SECRET` | Segredo para assinar tokens (mín. 32 caracteres) |
| `NODE_ENV` | `development`, `production` ou `test` |
| `WHATSAPP_TOKEN` | Token da WhatsApp Business Cloud API (opcional — sem ele as mensagens só são logadas no console) |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número de telefone configurado no Meta Business |
| `WHATSAPP_VERIFY_TOKEN` | String qualquer que você escolhe — usada pro Meta validar o webhook (`GET /api/whatsapp/webhook`) |
| `ANTHROPIC_API_KEY` | Chave da API da Anthropic — sem ela, a IA de resposta a leads só loga no console (não responde de verdade) |

### 3. Frontend

O frontend é estático — basta servir a pasta `frontend/` (ex: extensão Live
Server do VS Code, ou `npx serve frontend`). Ele aponta para a API em
`http://localhost:3001` (ver `frontend/assets/js/api.js`).

## Migrations

Cada arquivo em `database/migrations/` é aplicado uma única vez, em ordem
alfabética, e registrado na tabela `schema_migrations`. Para adicionar uma
nova, crie `database/migrations/016_nome.sql` e rode `npm run migrate`
novamente.

## Deploy

Sugestão: backend em qualquer host Node (Render, Railway, Fly.io), frontend
em Vercel/Netlify (o CORS do backend já libera `https://teg-academia.vercel.app`
em produção — ajuste `backend/src/server.js` se o domínio final for outro).

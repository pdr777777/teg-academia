require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const errorMiddleware = require('./middleware/errorMiddleware');

const authRoutes = require('./routes/auth');
const alunosRoutes = require('./routes/alunos');
const planosRoutes = require('./routes/planos');
const matriculasRoutes = require('./routes/matriculas');
const pagamentosRoutes = require('./routes/pagamentos');
const treinosRoutes = require('./routes/treinos');
const sessoesRoutes = require('./routes/sessoes');
const frequenciasRoutes = require('./routes/frequencias');
const rankingRoutes = require('./routes/ranking');
const indicacoesRoutes = require('./routes/indicacoes');
const leadsRoutes = require('./routes/leads');
const aulasRoutes = require('./routes/aulas');
const adminRoutes = require('./routes/admin');
const configuracoesRoutes = require('./routes/configuracoes');
const equipeRoutes = require('./routes/equipe');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  JWT_SECRET fraco ou ausente — defina no .env');
}

const app = express();

app.use(helmet());
const ALLOWED_ORIGINS = [
  'https://teg-academia.pages.dev',
  'https://teg-academia.com.br',
  'https://www.teg-academia.com.br',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5500',
  'http://localhost:8080',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
];

function isOriginAllowed(origin) {
  if (!origin) return true; // file:// ou server-to-server
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // aceita preview deploys do Cloudflare Pages: *.teg-academia.pages.dev
  if (/^https:\/\/[a-z0-9-]+\.teg-academia\.pages\.dev$/.test(origin)) return true;
  return false;
}

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (origin, cb) => isOriginAllowed(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'))
    : '*',
  credentials: true,
}));
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

app.use('/api', limiter);
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/alunos', alunosRoutes);
app.use('/api/planos', planosRoutes);
app.use('/api/matriculas', matriculasRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/treinos', treinosRoutes);
app.use('/api/sessoes', sessoesRoutes);
app.use('/api/frequencias', frequenciasRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/indicacoes', indicacoesRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/aulas', aulasRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/configuracoes', configuracoesRoutes);
app.use('/api/equipe', equipeRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use(errorMiddleware);

const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));

  const { startJobWorker } = require('./jobs/jobWorker');
  startJobWorker();
}

module.exports = app;

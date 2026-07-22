require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const errorMiddleware = require('./middleware/errorMiddleware');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const { register, metricsMiddleware } = require('./middleware/metrics');
const pool = require('./config/db');

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
const whatsappRoutes = require('./routes/whatsapp');
const webhooksRoutes = require('./routes/webhooks');
const notificacoesRoutes = require('./routes/notificacoes');
const catracaRoutes = require('./routes/catraca');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  JWT_SECRET fraco ou ausente — defina no .env');
}

const app = express();

app.use(requestId);
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
  // App nativo (Capacitor) — WebView serve o conteúdo local com essa origem
  // fixa em iOS e Android (androidScheme padrão é 'https' desde Capacitor 3+).
  'https://localhost',
  'capacitor://localhost',
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
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

// Rate limiting, log de requisição e métricas ficam fora do ambiente de teste:
// o limite de 10 req/15min em /api/auth é apertado demais pro volume de uma
// suíte de integração, e o log/métrica de cada chamada só faz ruído nos testes.
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
  // Sem isso, o wizard "Adicionar aluno" do admin (que chama POST
  // /api/auth/registro pra cada matrícula presencial) trava o próprio admin
  // fora do sistema no 11º cadastro em 15min num dia de matrícula em massa —
  // o mesmo limite pensado pra login por força bruta também batia na
  // ferramenta administrativa. Admin/dono com token já válido (portanto já
  // autenticado, não é o cenário de força bruta que o limite existe pra
  // barrar) fica de fora; login/registro/esqueci-senha público continuam
  // limitados normalmente.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skip: (req) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) return false;
      try {
        const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        return payload.role === 'admin' || payload.role === 'dono';
      } catch {
        return false;
      }
    },
  });

  app.use('/api', limiter);
  app.use('/api/auth', authLimiter);
  app.use(requestLogger);
  app.use(metricsMiddleware);
}

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
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/notifications', notificacoesRoutes);
app.use('/api/catraca', catracaRoutes);

app.get('/health', async (req, res) => {
  const health = { status: 'ok', timestamp: new Date().toISOString(), dependencies: {} };

  const inicio = process.hrtime.bigint();
  try {
    await pool.query('SELECT 1');
    health.dependencies.database = {
      status: 'ok',
      latencyMs: Math.round(Number(process.hrtime.bigint() - inicio) / 1e6 * 100) / 100,
    };
  } catch (err) {
    health.status = 'degraded';
    health.dependencies.database = { status: 'error', error: err.message };
  }

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

app.get('/metrics', async (req, res, next) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    next(err);
  }
});

app.use(errorMiddleware);

const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));

  const { startJobWorker } = require('./jobs/jobWorker');
  startJobWorker();
}

module.exports = app;

const { Pool } = require('pg');
require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test';

// Postgres local (CI em container, dev na máquina) não fala SSL; Supabase/Railway
// remotos exigem. Decide pelo host da connection string, não pelo NODE_ENV, porque
// testes locais normalmente apontam pra um Postgres remoto de teste (com SSL).
function isLocalHost(databaseUrl) {
  if (!databaseUrl) return false;
  try {
    const { hostname } = new URL(databaseUrl);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalHost(process.env.DATABASE_URL)
    ? false
    : process.env.DATABASE_CA_CERT
      ? { ca: process.env.DATABASE_CA_CERT }
      : { rejectUnauthorized: false },
  options: isTest ? '-c search_path=academia_test' : undefined,
});

module.exports = pool;

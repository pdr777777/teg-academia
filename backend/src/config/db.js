const { Pool } = require('pg');
require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_CA_CERT
    ? { ca: process.env.DATABASE_CA_CERT }
    : { rejectUnauthorized: false },
  options: isTest ? '-c search_path=academia_test' : undefined,
});

module.exports = pool;

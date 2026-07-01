require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db.js');

const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');

async function run() {
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map(r => r.filename));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Ignorando ${file} (já aplicada)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      process.stdout.write(`Aplicando ${file}... `);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log('OK');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log('\nMigrations em dia.');
  } catch (err) {
    console.error(`\nFALHOU: ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();

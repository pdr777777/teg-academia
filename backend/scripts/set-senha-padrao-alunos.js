// Define a senha padrão "123456" pra todos os alunos que ainda não têm senha
// própria (base importada da CloudGym, ninguém nunca logou / trocou senha —
// ver import-cloudgym.js). Por padrão só SIMULA (dry-run); só grava com --commit.
//
// Uso:
//   node scripts/set-senha-padrao-alunos.js            (prévia)
//   node scripts/set-senha-padrao-alunos.js --commit    (grava)
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const SENHA_PADRAO = '123456';

async function main() {
  const commit = process.argv.includes('--commit');

  // Só alunos sem histórico de troca de senha — nunca sobrescreve a senha de
  // quem já se autoatendeu (autoatendimento em PATCH/POST /api/auth ou reset
  // pelo admin sempre grava senha_alterada_em).
  const { rows: alvo } = await pool.query(
    `SELECT id, nome, email FROM usuarios
     WHERE role = 'aluno' AND excluido_em IS NULL AND senha_alterada_em IS NULL
     ORDER BY id`
  );

  console.log('=== Senha padrão para alunos ===');
  console.log('Alunos sem senha própria (elegíveis):', alvo.length);
  const semEmailReal = alvo.filter((a) => a.email.endsWith('@import.teg-academia.local')).length;
  if (semEmailReal) {
    console.log(`  (${semEmailReal} desses têm e-mail placeholder de import — não vão conseguir logar até o e-mail real ser cadastrado)`);
  }

  if (!commit) {
    console.log('\n[DRY RUN] Nada foi gravado. Rode de novo com --commit pra gravar.');
    await pool.end();
    return;
  }

  if (!alvo.length) {
    console.log('\nNada para atualizar.');
    await pool.end();
    return;
  }

  const senha_hash = await bcrypt.hash(SENHA_PADRAO, 10);
  const { rowCount } = await pool.query(
    `UPDATE usuarios SET senha_hash = $1, updated_at = NOW()
     WHERE role = 'aluno' AND excluido_em IS NULL AND senha_alterada_em IS NULL`,
    [senha_hash]
  );

  console.log(`\n[COMMIT] Senha padrão "${SENHA_PADRAO}" aplicada a ${rowCount} aluno(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// Import da base antiga de alunos da CloudGym (concorrente que o dono da TEG
// usava antes). Lê um .xlsx exportado de lá, mapeia pro nosso schema e por
// padrão só SIMULA (dry-run) — só grava no banco de verdade com --commit.
//
// Uso:
//   node scripts/import-cloudgym.js "C:/caminho/ativos.xlsx"                (prévia)
//   node scripts/import-cloudgym.js "C:/caminho/ativos.xlsx" --commit       (grava)
//
// Regras de mapeamento de plano (campo "Plano" da CloudGym, pega o último
// segmento quando vem histórico concatenado com "|"):
//   GYMPASS/TOTALPASS   -> aluno sem matrícula, origem_externa = gympass_totalpass
//   MENSAL ...          -> plano Mensal
//   ... TRIMESTRAL ...  -> plano Trimestral
//   ... SEMESTRAL ...   -> plano Pro Semestral
//   ... ANUAL ...       -> plano Anual
//   vazio               -> aluno sem matrícula, sem origem_externa
//   qualquer outro texto (PERSONAL, PARCERIAS, CONJUGE, QUINZENAL, SEMANAL,
//   BIOVILLA, AULA EXPERIMENTAL, MIGRACAO...) -> aluno sem matrícula,
//   origem_externa = texto bruto (preservado pra revisão manual depois,
//   em vez de eu inventar uma categoria pra cada um)
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const pool = require('../src/config/db');

const PLANO_IDS = { mensal: 5, trimestral: 6, semestral: 3, anual: 7 };

function parseData(str) {
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mth, y] = m;
  const data = new Date(Date.UTC(Number(y), Number(mth) - 1, Number(d)));
  return Number.isNaN(data.getTime()) ? null : data;
}

function normalizaCpf(valor) {
  const digitos = String(valor).replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.padStart(11, '0');
}

function normalizaTelefone(valor) {
  const bruto = String(valor).trim();
  if (!bruto || bruto.toLowerCase() === 'null') return null;
  const digitos = bruto.replace(/\D/g, '');
  return digitos || null;
}

function normalizaEmail(valor) {
  const bruto = String(valor).trim().toLowerCase();
  return bruto || null;
}

function ultimoSegmentoPlano(valor) {
  const partes = String(valor).split('|').map((p) => p.trim()).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : '';
}

function mapeiaPlano(planoTexto) {
  const upper = planoTexto.toUpperCase();
  if (!upper) return { plano_id: null, origem_externa: null };
  if (upper.includes('GYMPASS') || upper.includes('TOTALPASS')) {
    return { plano_id: null, origem_externa: 'gympass_totalpass' };
  }
  if (upper.startsWith('MENSAL')) return { plano_id: PLANO_IDS.mensal, origem_externa: null };
  if (upper.includes('TRIMESTRAL')) return { plano_id: PLANO_IDS.trimestral, origem_externa: null };
  if (upper.includes('SEMESTRAL')) return { plano_id: PLANO_IDS.semestral, origem_externa: null };
  if (upper.includes('ANUAL')) return { plano_id: PLANO_IDS.anual, origem_externa: null };
  return { plano_id: null, origem_externa: planoTexto };
}

function slugifica(nome) {
  return String(nome)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40) || 'aluno';
}

// Une candidatos que compartilham CPF OU e-mail (mesmo que não seja a mesma
// chave) — duas linhas com CPF diferente mas o mesmo e-mail, por exemplo,
// precisam virar UMA conta só, senão a constraint unique(email) estoura na
// hora de gravar. Union-find simples sobre os índices do array.
function deduplicaPorCpfOuEmail(candidatos) {
  const pai = candidatos.map((_, i) => i);
  function acharRaiz(i) {
    while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; }
    return i;
  }
  function unir(a, b) {
    const ra = acharRaiz(a); const rb = acharRaiz(b);
    if (ra !== rb) pai[ra] = rb;
  }

  const primeiraOcorrenciaCpf = new Map();
  const primeiraOcorrenciaEmail = new Map();
  candidatos.forEach((c, i) => {
    if (c.cpf) {
      if (primeiraOcorrenciaCpf.has(c.cpf)) unir(i, primeiraOcorrenciaCpf.get(c.cpf));
      else primeiraOcorrenciaCpf.set(c.cpf, i);
    }
    if (c.email) {
      if (primeiraOcorrenciaEmail.has(c.email)) unir(i, primeiraOcorrenciaEmail.get(c.email));
      else primeiraOcorrenciaEmail.set(c.email, i);
    }
  });

  const grupos = new Map();
  candidatos.forEach((_, i) => {
    const raiz = acharRaiz(i);
    if (!grupos.has(raiz)) grupos.set(raiz, []);
    grupos.get(raiz).push(i);
  });

  let duplicadas = 0;
  const unicos = [];
  for (const indices of grupos.values()) {
    if (indices.length > 1) duplicadas += indices.length - 1;
    const linhas = indices.map((i) => candidatos[i])
      .sort((a, b) => (b.dataInicio?.getTime() ?? 0) - (a.dataInicio?.getTime() ?? 0));
    const base = linhas[0];
    unicos.push({
      ...base,
      cpf: linhas.find((l) => l.cpf)?.cpf ?? null,
      email: linhas.find((l) => l.email)?.email ?? null,
      telefone: linhas.find((l) => l.telefone)?.telefone ?? null,
    });
  }
  return { unicos, duplicadas };
}

async function main() {
  const arquivo = process.argv[2];
  const commit = process.argv.includes('--commit');
  if (!arquivo) {
    console.error('Uso: node scripts/import-cloudgym.js <arquivo.xlsx> [--commit]');
    process.exitCode = 1;
    return;
  }

  const wb = XLSX.readFile(path.resolve(arquivo));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const hoje = new Date();
  const relatorio = {
    totalLinhas: linhas.length,
    semNomeIgnoradas: 0,
    duplicadasNoArquivo: 0,
    jaExistemNoBanco: 0,
    semEmailComPlaceholder: 0,
    planoInconsistenteVirouOrigemExterna: 0,
    paraCriar: [],
    porOrigemExterna: {},
    porPlano: {},
  };

  // 1) normaliza cada linha
  const candidatos = [];
  for (const linha of linhas) {
    const nome = String(linha.Nome).trim();
    if (!nome) { relatorio.semNomeIgnoradas++; continue; }

    const cpf = normalizaCpf(linha.CPF);
    const email = normalizaEmail(linha.Email);
    const telefone = normalizaTelefone(linha.Celular);
    const planoTexto = ultimoSegmentoPlano(linha.Plano);
    const { plano_id, origem_externa } = mapeiaPlano(planoTexto);
    const dataInicio = parseData(linha['Início']);
    const dataVencimento = parseData(linha.Final);

    candidatos.push({ nome, cpf, email, telefone, plano_id, origem_externa, dataInicio, dataVencimento, planoTexto });
  }

  // 2) dedup dentro do arquivo — une quem compartilha CPF OU e-mail
  // (union-find), não só uma chave preferencial
  const { unicos, duplicadas } = deduplicaPorCpfOuEmail(candidatos);
  relatorio.duplicadasNoArquivo = duplicadas;

  // 3) contra o banco (email/cpf já cadastrados)
  const { rows: existentes } = await pool.query('SELECT cpf, email FROM usuarios');
  const cpfsExistentes = new Set(existentes.map((u) => u.cpf).filter(Boolean));
  const emailsExistentes = new Set(existentes.map((u) => u.email).filter(Boolean));

  let contadorPlaceholder = 0;
  for (const c of unicos) {
    if ((c.cpf && cpfsExistentes.has(c.cpf)) || (c.email && emailsExistentes.has(c.email))) {
      relatorio.jaExistemNoBanco++;
      continue;
    }

    let emailFinal = c.email;
    if (!emailFinal) {
      contadorPlaceholder++;
      relatorio.semEmailComPlaceholder++;
      emailFinal = `sememail.${c.cpf || slugifica(c.nome) + '.' + contadorPlaceholder}@import.teg-academia.local`;
    }

    let matricula = null;
    let origemExterna = c.origem_externa;
    if (c.plano_id) {
      if (c.dataInicio && c.dataVencimento && c.dataVencimento > c.dataInicio) {
        matricula = {
          plano_id: c.plano_id,
          data_inicio: c.dataInicio,
          data_vencimento: c.dataVencimento,
          status: c.dataVencimento < hoje ? 'vencida' : 'ativa',
        };
      } else {
        relatorio.planoInconsistenteVirouOrigemExterna++;
        origemExterna = c.planoTexto;
      }
    }

    relatorio.paraCriar.push({
      nome: c.nome, email: emailFinal, cpf: c.cpf, telefone: c.telefone,
      origem_externa: origemExterna, matricula,
    });

    const chaveOrigem = origemExterna || (matricula ? `plano:${matricula.plano_id}` : '(nenhuma)');
    relatorio.porOrigemExterna[chaveOrigem] = (relatorio.porOrigemExterna[chaveOrigem] || 0) + 1;
  }

  console.log('=== Resumo do import CloudGym ===');
  console.log('Linhas no arquivo:            ', relatorio.totalLinhas);
  console.log('Ignoradas (sem nome):         ', relatorio.semNomeIgnoradas);
  console.log('Duplicadas dentro do arquivo: ', relatorio.duplicadasNoArquivo);
  console.log('Já existem no banco (pulado): ', relatorio.jaExistemNoBanco);
  console.log('Sem e-mail (ganhou placeholder):', relatorio.semEmailComPlaceholder);
  console.log('Plano com datas inconsistentes -> virou origem_externa:', relatorio.planoInconsistenteVirouOrigemExterna);
  console.log('\nA CRIAR:', relatorio.paraCriar.length, 'contas novas');
  console.log('\nDistribuição (origem_externa / plano):');
  Object.entries(relatorio.porOrigemExterna).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(' ', v, '\t', k));

  // Salva do lado do próprio arquivo de origem (fora do repositório) — essa
  // prévia tem PII real (nome, CPF, telefone), nunca deve entrar no git.
  const previaPath = path.join(path.dirname(path.resolve(arquivo)), 'import-cloudgym-previa.json');
  require('fs').writeFileSync(previaPath, JSON.stringify(relatorio.paraCriar, null, 2));
  console.log('\nPrévia completa salva em:', previaPath);

  if (!commit) {
    console.log('\n[DRY RUN] Nada foi gravado no banco. Rode de novo com --commit pra gravar.');
    await pool.end();
    return;
  }

  console.log('\n[COMMIT] Gravando', relatorio.paraCriar.length, 'contas no banco...');
  // Cada aluno é gravado na sua própria transação (usuário + matrícula) —
  // se uma linha falhar (constraint que a prévia não pegou, por exemplo),
  // só ela é perdida, o resto do lote segue normalmente.
  let criadas = 0;
  const falhas = [];
  for (const p of relatorio.paraCriar) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const senhaTemporaria = crypto.randomBytes(16).toString('hex');
      const senha_hash = await bcrypt.hash(senhaTemporaria, 10);
      const linkIndicacao = crypto.randomBytes(5).toString('hex');

      const { rows: [usuario] } = await client.query(
        `INSERT INTO usuarios (nome, email, senha_hash, telefone, cpf, role, link_indicacao, origem_externa)
         VALUES ($1, $2, $3, $4, $5, 'aluno', $6, $7) RETURNING id`,
        [p.nome, p.email, senha_hash, p.telefone, p.cpf, linkIndicacao, p.origem_externa]
      );

      if (p.matricula) {
        await client.query(
          `INSERT INTO matriculas (usuario_id, plano_id, data_inicio, data_vencimento, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [usuario.id, p.matricula.plano_id, p.matricula.data_inicio, p.matricula.data_vencimento, p.matricula.status]
        );
      }
      await client.query('COMMIT');
      criadas++;
    } catch (err) {
      await client.query('ROLLBACK');
      falhas.push({ nome: p.nome, email: p.email, cpf: p.cpf, erro: err.message });
    } finally {
      client.release();
    }
  }

  console.log('OK —', criadas, 'contas criadas.');
  if (falhas.length) {
    console.log(falhas.length, 'linha(s) falharam e foram puladas:');
    falhas.slice(0, 20).forEach((f) => console.log(' -', f.nome, '|', f.email, '|', f.erro));
    const falhasPath = path.join(path.dirname(path.resolve(arquivo)), 'import-cloudgym-falhas.json');
    require('fs').writeFileSync(falhasPath, JSON.stringify(falhas, null, 2));
    console.log('Lista completa de falhas salva em:', falhasPath);
  }
  await pool.end();
}

main();

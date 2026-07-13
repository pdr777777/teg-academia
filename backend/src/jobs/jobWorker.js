const pool = require('../config/db');
const whatsapp = require('../services/whatsappService');
const { getGatewayAdapter } = require('../services/gateway');

async function processarJob(job) {
  const { tipo, payload } = job;

  if (tipo === 'whatsapp_ausencia') {
    await whatsapp.enviarLembreteAusencia(payload.telefone, payload.nome, payload.dias);
  } else if (tipo === 'whatsapp_vencimento') {
    await whatsapp.enviarLembreteVencimento(payload.telefone, payload.nome, payload.dias_restantes);
  } else if (tipo === 'whatsapp_aniversario') {
    await whatsapp.enviarPaizens(payload.telefone, payload.nome);
  } else if (tipo === 'whatsapp_reativacao') {
    await whatsapp.enviarReativacao(payload.telefone, payload.nome);
  } else if (tipo === 'whatsapp_cobranca_gerada') {
    await whatsapp.enviarCobrancaGerada(payload.telefone, payload.nome, payload.link_pagamento);
  } else if (tipo === 'whatsapp_atraso') {
    await whatsapp.enviarLembreteAtraso(payload.telefone, payload.nome, payload.dias_atraso);
  }
}

async function agendarAutomacoes() {
  // Ausência: alunos sem check-in há 7 dias
  const { rows: ausentes } = await pool.query(`
    SELECT u.id, u.nome, u.telefone, MAX(f.data) as ultimo_treino
    FROM usuarios u
    JOIN matriculas m ON m.usuario_id = u.id AND m.status = 'ativa'
    LEFT JOIN frequencias f ON f.usuario_id = u.id
    WHERE u.role = 'aluno' AND u.ativo = TRUE
    GROUP BY u.id, u.nome, u.telefone
    HAVING MAX(f.data) < CURRENT_DATE - INTERVAL '7 days' OR MAX(f.data) IS NULL
  `);

  for (const a of ausentes) {
    const jaEnviou = await pool.query(
      `SELECT id FROM automacoes_log WHERE usuario_id = $1 AND tipo = 'ausencia'
       AND created_at > NOW() - INTERVAL '7 days'`,
      [a.id]
    );
    if (jaEnviou.rows.length) continue;

    const dias = a.ultimo_treino
      ? Math.floor((Date.now() - new Date(a.ultimo_treino)) / 86400000)
      : 30;

    await pool.query(
      `INSERT INTO jobs (tipo, payload, agendado_para) VALUES ($1, $2, NOW())`,
      ['whatsapp_ausencia', JSON.stringify({ telefone: a.telefone, nome: a.nome, dias })]
    );
    await pool.query(
      `INSERT INTO automacoes_log (usuario_id, tipo, mensagem, status) VALUES ($1, 'ausencia', $2, 'enviado')`,
      [a.id, `Lembrete ausência ${dias} dias`]
    );
  }

  // Vencimento: vence em 3 dias
  const { rows: vencendo } = await pool.query(`
    SELECT u.id, u.nome, u.telefone,
           EXTRACT(DAY FROM m.data_vencimento - NOW())::int AS dias_restantes
    FROM matriculas m JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.status = 'ativa'
      AND m.data_vencimento BETWEEN NOW() AND NOW() + INTERVAL '3 days'
  `);

  for (const v of vencendo) {
    const jaEnviou = await pool.query(
      `SELECT id FROM automacoes_log WHERE usuario_id = $1 AND tipo = 'vencimento'
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [v.id]
    );
    if (jaEnviou.rows.length) continue;

    await pool.query(
      `INSERT INTO jobs (tipo, payload, agendado_para) VALUES ($1, $2, NOW())`,
      ['whatsapp_vencimento', JSON.stringify({ telefone: v.telefone, nome: v.nome, dias_restantes: v.dias_restantes })]
    );
    await pool.query(
      `INSERT INTO automacoes_log (usuario_id, tipo, mensagem, status) VALUES ($1, 'vencimento', $2, 'enviado')`,
      [v.id, `Vencimento em ${v.dias_restantes} dias`]
    );
  }

  // Reativação: plano venceu há 15+ dias e não renovou — oferta única de volta
  const { rows: paraReativar } = await pool.query(`
    SELECT u.id, u.nome, u.telefone
    FROM matriculas m JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.status = 'vencida' AND m.data_vencimento <= CURRENT_DATE - INTERVAL '15 days'
  `);

  for (const r of paraReativar) {
    const jaEnviou = await pool.query(
      `SELECT id FROM automacoes_log WHERE usuario_id = $1 AND tipo = 'reativacao'`,
      [r.id]
    );
    if (jaEnviou.rows.length) continue;

    await pool.query(
      `INSERT INTO jobs (tipo, payload, agendado_para) VALUES ($1, $2, NOW())`,
      ['whatsapp_reativacao', JSON.stringify({ telefone: r.telefone, nome: r.nome })]
    );
    await pool.query(
      `INSERT INTO automacoes_log (usuario_id, tipo, mensagem, status) VALUES ($1, 'reativacao', $2, 'enviado')`,
      [r.id, 'Oferta de reativação R$10 desconto']
    );
  }

  // Atraso: matrícula vencida/suspensa, repete a cada 2 dias até regularizar
  const { rows: atrasados } = await pool.query(`
    SELECT u.id, u.nome, u.telefone,
           (CURRENT_DATE - m.data_vencimento::date)::int AS dias_atraso
    FROM matriculas m JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.status IN ('vencida', 'suspensa') AND m.data_vencimento::date < CURRENT_DATE
  `);

  for (const a of atrasados) {
    const jaEnviou = await pool.query(
      `SELECT id FROM automacoes_log WHERE usuario_id = $1 AND tipo = 'atraso'
       AND created_at > NOW() - INTERVAL '2 days'`,
      [a.id]
    );
    if (jaEnviou.rows.length) continue;

    await pool.query(
      `INSERT INTO jobs (tipo, payload, agendado_para) VALUES ($1, $2, NOW())`,
      ['whatsapp_atraso', JSON.stringify({ telefone: a.telefone, nome: a.nome, dias_atraso: a.dias_atraso })]
    );
    await pool.query(
      `INSERT INTO automacoes_log (usuario_id, tipo, mensagem, status) VALUES ($1, 'atraso', $2, 'enviado')`,
      [a.id, `Lembrete de atraso: ${a.dias_atraso} dia(s)`]
    );
  }

  // Aniversário
  const { rows: aniversariantes } = await pool.query(`
    SELECT u.id, u.nome, u.telefone FROM usuarios u
    WHERE u.ativo = TRUE
      AND EXTRACT(MONTH FROM u.data_nascimento) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(DAY FROM u.data_nascimento) = EXTRACT(DAY FROM NOW())
  `);

  for (const a of aniversariantes) {
    const jaEnviou = await pool.query(
      `SELECT id FROM automacoes_log WHERE usuario_id = $1 AND tipo = 'aniversario'
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [a.id]
    );
    if (jaEnviou.rows.length) continue;

    await pool.query(
      `INSERT INTO jobs (tipo, payload, agendado_para) VALUES ($1, $2, NOW())`,
      ['whatsapp_aniversario', JSON.stringify({ telefone: a.telefone, nome: a.nome })]
    );
    await pool.query(
      `INSERT INTO automacoes_log (usuario_id, tipo, mensagem, status) VALUES ($1, 'aniversario', $2, 'enviado')`,
      [a.id, 'Mensagem de aniversário']
    );
  }
}

async function processarVencimentos() {
  const adapter = getGatewayAdapter();

  // 1. Matrículas ativas vencendo hoje (ou já vencidas sem cobrança gerada,
  //    caso o worker tenha ficado fora do ar no dia exato): gera a cobrança
  //    da próxima renovação. Não mexe em status/data_vencimento aqui — só a
  //    confirmação do pagamento (manual ou via webhook) avança o ciclo, pra
  //    não dar carência automática antes da tolerância configurada.
  const { rows: vencendoHoje } = await pool.query(`
    SELECT m.id AS matricula_id, m.usuario_id, m.data_vencimento, p.preco_mensal, p.duracao_dias, u.telefone, u.nome
    FROM matriculas m
    JOIN planos p ON p.id = m.plano_id
    JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.status = 'ativa' AND m.data_vencimento::date <= CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM pagamentos
        WHERE matricula_id = m.id AND gerado_automaticamente = TRUE AND created_at::date >= m.data_vencimento::date
      )
  `);

  for (const m of vencendoHoje) {
    try {
      const meses = Math.round(m.duracao_dias / 30);
      const valor = Number((m.preco_mensal * meses).toFixed(2));

      const { gateway_charge_id, link_pagamento } = await adapter.criarCobranca({
        valor,
        vencimento: m.data_vencimento,
        usuario: { id: m.usuario_id, telefone: m.telefone },
      });

      await pool.query(
        `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, gateway, gateway_charge_id, link_pagamento, gerado_automaticamente)
         VALUES ($1, $2, $3, 'pendente', $4, $5, $6, TRUE)`,
        [m.matricula_id, m.usuario_id, valor, process.env.PAYMENT_GATEWAY || 'manual', gateway_charge_id, link_pagamento]
      );

      await pool.query(
        `INSERT INTO jobs (tipo, payload, agendado_para) VALUES ($1, $2, NOW())`,
        ['whatsapp_cobranca_gerada', JSON.stringify({ telefone: m.telefone, nome: m.nome, link_pagamento })]
      );
    } catch (err) {
      // Isola a falha por matrícula: um erro do gateway (rede, API fora do ar
      // etc.) numa cobrança não pode impedir a geração das outras nem as fases
      // 2/3 (marcar vencida/suspensa), que rodam incondicionalmente depois.
      console.error(`[JobWorker] falha ao gerar cobrança para matrícula ${m.matricula_id}:`, err.message);
    }
  }

  // 2. Ativas com vencimento no passado → vencida
  await pool.query(`
    UPDATE matriculas SET status = 'vencida', updated_at = NOW()
    WHERE status = 'ativa' AND data_vencimento::date < CURRENT_DATE
  `);

  // 3. Vencidas além da tolerância configurada → suspensa
  const { rows: [{ dias_tolerancia_bloqueio }] } = await pool.query(
    'SELECT dias_tolerancia_bloqueio FROM configuracoes WHERE id = 1'
  );
  await pool.query(
    `UPDATE matriculas SET status = 'suspensa', updated_at = NOW()
     WHERE status = 'vencida' AND data_vencimento::date <= CURRENT_DATE - $1::int`,
    [dias_tolerancia_bloqueio]
  );
}

async function executarJobsPendentes() {
  const { rows: jobs } = await pool.query(
    `UPDATE jobs SET status = 'processando', tentativas = tentativas + 1
     WHERE id IN (
       SELECT id FROM jobs WHERE status IN ('pendente', 'erro') AND agendado_para <= NOW() AND tentativas < 3
       LIMIT 10 FOR UPDATE SKIP LOCKED
     ) RETURNING *`
  );

  for (const job of jobs) {
    try {
      await processarJob(job);
      await pool.query(
        `UPDATE jobs SET status = 'concluido', executado_em = NOW() WHERE id = $1`,
        [job.id]
      );
    } catch (err) {
      await pool.query(
        `UPDATE jobs SET status = 'erro', erro = $1 WHERE id = $2`,
        [err.message, job.id]
      );
    }
  }
}

function startJobWorker() {
  setInterval(async () => {
    try {
      await processarVencimentos();
      await agendarAutomacoes();
      await executarJobsPendentes();
    } catch (err) {
      console.error('[JobWorker] erro:', err.message);
    }
  }, 5 * 60 * 1000); // a cada 5 minutos

  console.log('⚙️  JobWorker iniciado');
}

module.exports = { startJobWorker, processarVencimentos, agendarAutomacoes, processarJob };

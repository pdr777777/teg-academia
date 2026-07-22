// Aplica os vídeos do canal do YouTube aos exercícios — curado à mão (não
// por fuzzy match automático, que errava demais em variações parecidas tipo
// "agachamento smith" vs "afundo no smith" vs "búlgaro no smith").
//
// Cada item é { url, existente: <id> } pra reaproveitar exercício já
// cadastrado, ou { url, novo: { nome, grupo_muscular } } pra criar um novo
// (equipamento específico da academia que não tem entrada genérica
// equivalente no banco).
//
// Uso: node scripts/import-videos.js            (prévia, não grava)
//      node scripts/import-videos.js --commit    (grava de verdade)
const pool = require('../src/config/db');

const ITENS = [
  { url: 'https://www.youtube.com/shorts/qqqXFDOXIrw', existente: 153 }, // Hack machine (variações) -> Agachamento Hack (Máquina)
  { url: 'https://www.youtube.com/shorts/jAsxbNpDyQE', novo: { nome: 'Remada Articular Horizontal', grupo_muscular: 'Costas' } },
  { url: 'https://www.youtube.com/shorts/V4Lf-gHuwdk', pular: 'duplicado do anterior (Remada Articular Horizontal)' },
  { url: 'https://www.youtube.com/shorts/QqjBmzgSP8s', novo: { nome: 'Glúteo no Banco Romano', grupo_muscular: 'Glúteos' } },
  { url: 'https://www.youtube.com/shorts/voflThI_hDM', novo: { nome: 'Afundo no Smith', grupo_muscular: 'Quadríceps' } },
  { url: 'https://www.youtube.com/shorts/Tm9jWR4YK9w', novo: { nome: 'Agachamento Búlgaro no Smith', grupo_muscular: 'Quadríceps' } },
  { url: 'https://www.youtube.com/shorts/uueivk367v4', pular: 'duplicado do Hack Machine (item 1)' },
  { url: 'https://www.youtube.com/shorts/zhEuAaEQN-w', existente: 256 }, // Lombar Banco Romano -> Hiperextensão Lombar (Banco Romano)
  { url: 'https://www.youtube.com/shorts/KA6cNf8n_Ho', existente: 308 }, // Stiff Unilateral -> Stiff Unilateral (Halteres)
  { url: 'https://www.youtube.com/shorts/rSLue-44aCQ', existente: 188 }, // Stiff com Halter -> Stiff (Halteres)
  { url: 'https://www.youtube.com/shorts/U_YHfrad8hY', novo: { nome: 'Elevação Frontal + Lateral (Bi-set)', grupo_muscular: 'Ombro' } },
  { url: 'https://www.youtube.com/shorts/b-hvK_C96hU', existente: 309 }, // Elevação Pélvica Guiada -> Elevação Pélvica no Smith
  { url: 'https://www.youtube.com/shorts/ItjlGd26fGE', existente: 4 }, // Leg Press 45 -> Leg Press 45°
  { url: 'https://www.youtube.com/shorts/etZWcOpladY', novo: { nome: 'Desenvolvimento Articular Ombro', grupo_muscular: 'Ombro' } },
  { url: 'https://www.youtube.com/shorts/0yvlWWWRjOo', existente: 144 }, // Encolhimento trapézio barra guiada (SMITH) -> Encolhimento de Ombros (Smith)
  { url: 'https://www.youtube.com/shorts/vLtp_I7-ChE', novo: { nome: 'Leg Press Horizontal Unilateral', grupo_muscular: 'Quadríceps' } }, // vídeo combina "horizontal" + "unilateral", nenhum existente cobre os dois
  { url: 'https://www.youtube.com/shorts/jhOu94iSl5U', novo: { nome: 'Elevação Unilateral no Apolete', grupo_muscular: 'Ombro' } },
  { url: 'https://www.youtube.com/shorts/cqX_7N1tw8Q', novo: { nome: 'Elevação Lateral no Apolete', grupo_muscular: 'Ombro' } },
  { url: 'https://www.youtube.com/shorts/Uee3ieUf-tM', novo: { nome: 'Crucifixo Inverso Articular', grupo_muscular: 'Ombro' } },
  { url: 'https://www.youtube.com/shorts/3no_Jix-ydE', pular: 'duplicado do Desenvolvimento Articular Ombro (item 14)' },
  { url: 'https://www.youtube.com/shorts/zmMkEYQnOGs', novo: { nome: 'Remada Alta Articular (High Row)', grupo_muscular: 'Costas' } },
  { url: 'https://www.youtube.com/shorts/Wbm6Loca90M', novo: { nome: 'Stiff na Máquina Remada Curvada', grupo_muscular: 'Posterior de Coxa' } },
  { url: 'https://www.youtube.com/shorts/hyJq-kKyzkc', novo: { nome: 'Remada Curvada Máquina (Supinada)', grupo_muscular: 'Costas' } },
  { url: 'https://www.youtube.com/shorts/MJBPP8f4w-M', novo: { nome: 'Remada Curvada Máquina (Pronada)', grupo_muscular: 'Costas' } },
  { url: 'https://www.youtube.com/shorts/zpSuCBMFo1Q', novo: { nome: 'Remada Curvada Máquina (Neutra)', grupo_muscular: 'Costas' } },
  { url: 'https://www.youtube.com/shorts/gWrU4hRivbQ', existente: 50 }, // Remada Alta com barra livre -> Remada Alta (Barra)
  { url: 'https://www.youtube.com/shorts/yKA7sdvRUYE', existente: 64 }, // Desenvolvimento com barra livre -> Desenvolvimento Militar (Barra)
  { url: 'https://www.youtube.com/shorts/rx0tb3bQdeo', novo: { nome: 'Stiff na Máquina (Búlgaro)', grupo_muscular: 'Posterior de Coxa' } },
  { url: 'https://www.youtube.com/shorts/00QB3ZTvBwI', novo: { nome: 'Levantamento Terra Máquina (Búlgaro)', grupo_muscular: 'Costas' } },
  { url: 'https://www.youtube.com/shorts/uv303Wr9WNQ', existente: 12 }, // Supino Reto Articular TEG -> Supino Reto (Máquina)
  { url: 'https://www.youtube.com/shorts/2P_adAQEhro', novo: { nome: 'Afundo na Máquina Articular', grupo_muscular: 'Quadríceps' } },
  { url: 'https://www.youtube.com/shorts/rsciUi68A1Q', novo: { nome: 'Búlgaro na Máquina Articular', grupo_muscular: 'Quadríceps' } },
  { url: 'https://www.youtube.com/shorts/KL_KGeKiMl0', novo: { nome: 'Remada Articular Declinado', grupo_muscular: 'Costas' } },
  { url: 'https://www.youtube.com/shorts/_BHkPLilaqk', novo: { nome: 'Agachamento Sumô Articular', grupo_muscular: 'Quadríceps' } },
  { url: 'https://www.youtube.com/shorts/ASOP_Fgxs_g', novo: { nome: 'Alongamento Adutores', grupo_muscular: 'Glúteos' } },
  { url: 'https://www.youtube.com/shorts/X7ecuf9ImFw', novo: { nome: 'Alongamento Posteriores de Coxa (com Elástico)', grupo_muscular: 'Posterior de Coxa' } },
  { url: 'https://www.youtube.com/shorts/ggLNn7koCMg', novo: { nome: 'Alongamento Adutores no Espaldar', grupo_muscular: 'Glúteos' } },
  { url: 'https://www.youtube.com/shorts/iO5pZLGwUG8', novo: { nome: 'Alongamento Posteriores de Coxa no Espaldar', grupo_muscular: 'Posterior de Coxa' } },
  { url: 'https://www.youtube.com/shorts/LcwRr-9KKnI', existente: 87 }, // Rotação manguito interno -> Manguito Rotador (Interno, Polia)
  { url: 'https://www.youtube.com/shorts/Zj9ydejTx-c', existente: 86 }, // Rotação manguito externo -> Manguito Rotador (Externo, Polia)
  { url: 'https://www.youtube.com/shorts/VtW_8stfmHQ', novo: { nome: 'Abdutora em Pé Articular', grupo_muscular: 'Glúteos' } },
  { url: 'https://www.youtube.com/shorts/VDeY3H7fiJ4', novo: { nome: 'Iso Peitoral', grupo_muscular: 'Peito' } },
  { url: 'https://www.youtube.com/shorts/7_DOC6AqiOI', novo: { nome: 'Rosca Inversa no Cross Over', grupo_muscular: 'Bíceps' } }, // vídeo é na polia, só tinhamos versão (Barra)
  { url: 'https://www.youtube.com/shorts/WA80ctQ1M7Q', existente: 56 }, // Levantamento terra sumô romano -> Levantamento Terra Sumô
  { url: 'https://www.youtube.com/shorts/XPScXL7o6so', novo: { nome: 'Agachamento Sumô (Barra)', grupo_muscular: 'Quadríceps' } }, // vídeo é com barra, só tinhamos versão (Halteres)
  { url: 'https://www.youtube.com/shorts/mcQ0chEeCeM', existente: 242 }, // Abdominal Prancha Isométrica -> Prancha Abdominal (Frontal)
  { url: 'https://www.youtube.com/shorts/HLOAz3PluNk', existente: 173 }, // Passada (avanço) -> Passada (Barra)
  { url: 'https://www.youtube.com/shorts/PyotOVhAzQ0', novo: { nome: 'Flexor de Joelho Unilateral', grupo_muscular: 'Posterior de Coxa' } },
  { url: 'https://www.youtube.com/shorts/avUXf-b_-vk', novo: { nome: 'Step Up com Apoio', grupo_muscular: 'Quadríceps' } }, // "com apoio" não deixa claro se é (Halteres), melhor não forçar
  { url: 'https://www.youtube.com/shorts/jm5UkWhQ7dI', novo: { nome: 'Bi-set Cadeira Abdutora 45°+90°', grupo_muscular: 'Glúteos' } },
  { url: 'https://www.youtube.com/shorts/jh9s5Mdqev0', pular: 'duplicado do Afundo no Smith (item 5)' },
  { url: 'https://www.youtube.com/shorts/4_Hy2532WaQ', novo: { nome: 'Good Morning no Hack Squat Invertido', grupo_muscular: 'Lombar' } },
  { url: 'https://www.youtube.com/shorts/Ix_FXmYrE6A', novo: { nome: 'RDL Unilateral no Banco com Halter', grupo_muscular: 'Posterior de Coxa' } },
  { url: 'https://www.youtube.com/shorts/O_SOX7OIY2s', novo: { nome: 'Hiperextensão de Ombro em Pé com Halter', grupo_muscular: 'Ombro' } },
  { url: 'https://www.youtube.com/shorts/Ym6-t1kZ1YE', existente: 61 }, // Puxada frontal com triângulo -> Puxada Neutra (Triângulo)
  { url: 'https://www.youtube.com/shorts/hOMgasebgH0', novo: { nome: 'Elevação Lateral em Y (em Pé)', grupo_muscular: 'Ombro' } },
  { url: 'https://www.youtube.com/shorts/Sb9G597JNb8', existente: 77 }, // Elevação frontal com barra livre -> Elevação Frontal (Barra)
  { url: 'https://www.youtube.com/shorts/d2nVC0ZJWF4', existente: 72 }, // Elevação lateral unilateral no Cross over -> Elevação Lateral (Polia)
  { url: 'https://www.youtube.com/shorts/QpORCZGVKKs', existente: 205 }, // Abdução de quadril com caneleira no solo -> Abdução de Quadril (Polia)
  { url: 'https://www.youtube.com/shorts/Z4Bf_PRLdUc', novo: { nome: 'Abdução de Quadril com Caneleira (Banco Inclinado)', grupo_muscular: 'Glúteos' } },
  { url: 'https://www.youtube.com/shorts/sSKyKUR7bFw', existente: 51 }, // Remada serrote no Cross over -> Remada Serrote
  { url: 'https://www.youtube.com/shorts/V4rIesVIsbs', novo: { nome: 'Concha (Glúteo com Band, Deitado)', grupo_muscular: 'Glúteos' } },
  { url: 'https://www.youtube.com/shorts/KNK-bPUvfvg', novo: { nome: '4 Apoios no Cross Over', grupo_muscular: 'Glúteos' } }, // vídeo é no cross over, o existente #212 é "no solo" (equipamento diferente)
  { url: 'https://www.youtube.com/shorts/pzuzF-jIUSk', novo: { nome: 'Abdução de Quadril no Cabo (Frente e Trás)', grupo_muscular: 'Glúteos' } }, // vídeo é no cabo, o existente #204 é "(Máquina)"
  { url: 'https://www.youtube.com/shorts/R87MbpE7SEo', novo: { nome: 'Extensão de Quadril no Cross Over', grupo_muscular: 'Glúteos' } },
  { url: 'https://www.youtube.com/shorts/k74iTD4YuJE', existente: 210 }, // Glúteo coice no cross over -> Coice de Glúteo (Cabo/Polia)
  { url: 'https://www.youtube.com/shorts/-QJk_fEui8M', existente: 199 }, // Elevação Pélvica Unilateral no banco -> Elevação Pélvica Unilateral
  { url: 'https://www.youtube.com/shorts/g9McytfrLbc', existente: 155 }, // Búlgaro no banco (livre) -> Agachamento Búlgaro (Halteres)
  { url: 'https://www.youtube.com/shorts/3zFBbA12-w0', existente: 232 }, // Máquina de abdominal -> Abdominal na Máquina
  { url: 'https://www.youtube.com/shorts/wgQ2JxPjBAs', novo: { nome: 'Agachamento Sumô Livre (com Suporte)', grupo_muscular: 'Quadríceps' } },
  { url: 'https://www.youtube.com/shorts/rk0dDgTSJ0w', novo: { nome: 'Agachamento Squat Invertido', grupo_muscular: 'Quadríceps' } },
  { url: 'https://www.youtube.com/shorts/LkxQHvHdg1o', existente: 216 }, // Panturrilha em pé na máquina -> Panturrilha em Pé (Máquina)
  { url: 'https://www.youtube.com/shorts/0rBv-cvVguA', existente: 22 }, // Crucifixo na polia baixa no Cross over -> Crucifixo (Polia Baixa)
  { url: 'https://www.youtube.com/shorts/dcaOgo_wQmA', existente: 23 }, // Crucifixo na polia alta no Cross over -> Crucifixo (Polia Alta)
  { url: 'https://www.youtube.com/shorts/QIqIi0JV-58', existente: 78 }, // Elevação frontal unilateral Cross over -> Elevação Frontal (Polia)
  { url: 'https://www.youtube.com/shorts/wvLhYbwPRD4', pular: 'duplicado da Elevação Frontal (Polia), item anterior' },
  { url: 'https://www.youtube.com/shorts/aAkM0VzzYvo', existente: 100 }, // Rosca direta com barra no Cross over -> Rosca na Polia (Barra)
  { url: 'https://www.youtube.com/shorts/ddrjLIE-pr0', novo: { nome: 'Crucifixo Inclinado Articulado', grupo_muscular: 'Peito' } }, // vídeo é máquina/articulado, o existente #20 é "(Halteres)"
  { url: 'https://www.youtube.com/shorts/BGsiuzBzkno', novo: { nome: 'Remada Baixa (Pegada Neutra)', grupo_muscular: 'Costas' } }, // vídeo diz "neutra", só tínhamos "Pegada Aberta"/"Pegada Fechada"
  { url: 'https://www.youtube.com/shorts/MORN6hUKs0c', existente: 71 }, // Elevação lateral em pé com halter -> Elevação Lateral (Halteres)

  // --- segunda leva ---
  { url: 'https://www.youtube.com/shorts/K1BRbXYQoI4', novo: { nome: 'Elevação Frontal no Banco Inclinado', grupo_muscular: 'Ombro' } },
  { url: 'https://www.youtube.com/shorts/yhalqIHj6eI', novo: { nome: 'Barra Militar / Barra Suspensa Livre', grupo_muscular: 'Ombro' } },
  { url: 'https://www.youtube.com/shorts/45Y8YxIzSV0', existente: 7 }, // Rosca direta em pé com barra -> Rosca Direta (Barra)
  { url: 'https://www.youtube.com/shorts/rVxBLMxnBbI', existente: 97 }, // Rosca martelo com halter -> Rosca Martelo (Halteres)
  { url: 'https://www.youtube.com/shorts/X6chQCkr5EA', novo: { nome: 'Pull Down / Pullover na Polia Alta', grupo_muscular: 'Peito' } },
  { url: 'https://www.youtube.com/shorts/TmcZHVSi7XM', existente: 121 }, // Tríceps puley unilateral -> Extensão de Tríceps Unilateral (Polia)
  { url: 'https://www.youtube.com/shorts/4iKJwvwyJEw', existente: 8 }, // Tríceps puley com corda -> Tríceps Corda (Polia)
  { url: 'https://www.youtube.com/shorts/DCgRSCDyiWA', existente: 98 }, // Rosca martelo com corda Cross over -> Rosca Martelo (Cabo/Corda)
  { url: 'https://www.youtube.com/shorts/RpllqcO4-4o', novo: { nome: 'Rosca Bíceps Unilateral no Cross Over', grupo_muscular: 'Bíceps' } },
  { url: 'https://www.youtube.com/shorts/fDNqva2jpOA', existente: 111 }, // Tríceps puley com barra no Cross over -> Tríceps Barra (Polia)
  { url: 'https://www.youtube.com/shorts/AO-dMZZzP6Q', existente: 127 }, // Tríceps francês com corda no Cross over -> Tríceps Corda Overhead (Polia)
  { url: 'https://www.youtube.com/shorts/1kQ5i9FDQ_k', novo: { nome: 'Tríceps Testa com Barra no Cross Over', grupo_muscular: 'Tríceps' } }, // "testa" normal é deitado, no cabo é diferente do existente (Barra)
  { url: 'https://www.youtube.com/shorts/HnF94Zb924s', novo: { nome: 'Tríceps Máquina (Paralela)', grupo_muscular: 'Tríceps' } }, // parece máquina assistida de paralelas, diferente dos existentes
  { url: 'https://www.youtube.com/shorts/232HgAmnxhM', novo: { nome: 'Cadeira Flexora Unilateral', grupo_muscular: 'Posterior de Coxa' } },
  { url: 'https://www.youtube.com/shorts/Jmco7b6UVDQ', existente: 168 }, // Cadeira extensora simultânea -> Cadeira Extensora
  { url: 'https://www.youtube.com/shorts/Sn3nZ4YEwuM', existente: 181 }, // Cadeira flexora simultânea -> Cadeira Flexora
  { url: 'https://www.youtube.com/shorts/KI6vVUuRGMM', existente: 180 }, // Mesa flexora - flexor deitado -> Mesa Flexora
  { url: 'https://www.youtube.com/shorts/8jurNuPz4aE', existente: 15 }, // Supino inclinado com halter -> Supino Inclinado (Halteres)
  { url: 'https://www.youtube.com/shorts/bYPsDxfzyaE', existente: 14 }, // Supino inclinado com barra -> Supino Inclinado (Barra)
  { url: 'https://www.youtube.com/shorts/aVmw-5JJUG4', existente: 93 }, // Rosca scott -> Rosca Scott (Barra)
  { url: 'https://www.youtube.com/shorts/Ly9vnm7tIwM', existente: 1 }, // Supino reto com barra -> Supino Reto (Barra)
  { url: 'https://www.youtube.com/shorts/ooR_-UWhZZk', existente: 24 }, // Peck fly - voador -> Peck Deck (Voador)
  { url: 'https://www.youtube.com/shorts/dzyinmLuvNE', novo: { nome: 'Remada Baixa (Pegada Supinada)', grupo_muscular: 'Costas' } }, // só tínhamos Aberta/Fechada, e criamos Neutra na leva 1
  { url: 'https://www.youtube.com/shorts/-VTUVDgA5oU', existente: 46 }, // Remada cavalinho na máquina t bar -> Remada Cavalinho (T-Bar)
  { url: 'https://www.youtube.com/shorts/BsNRDVU8Hbc', existente: 5 }, // Puxador alto pegada pronada -> Puxada Frontal (Pegada Aberta) [pegada aberta = pronada, mesmo movimento]
  { url: 'https://www.youtube.com/shorts/ZjC2RId2JWY', existente: 81 }, // Crucifixo inverso no fly (voador) -> Crucifixo Invertido (Máquina/Peck Deck)
  { url: 'https://www.youtube.com/shorts/EJ4gM2C-WXo', pular: 'duplicado do Supino Reto (Máquina) — já tem vídeo "SUPINO RETO ARTICULAR TEG" da leva 1' },
];

async function main() {
  const commit = process.argv.includes('--commit');
  const { rows: exercicios } = await pool.query('SELECT id, nome, grupo_muscular FROM exercicios');
  const porId = new Map(exercicios.map((e) => [e.id, e]));

  const relatorio = { atualizarExistente: [], criarNovo: [], pulados: [], erros: [] };

  for (const item of ITENS) {
    if (item.pular) { relatorio.pulados.push({ url: item.url, motivo: item.pular }); continue; }
    if (item.existente) {
      const ex = porId.get(item.existente);
      if (!ex) { relatorio.erros.push(`ID ${item.existente} não existe (url ${item.url})`); continue; }
      relatorio.atualizarExistente.push({ id: ex.id, nome: ex.nome, url: item.url });
    } else if (item.novo) {
      relatorio.criarNovo.push({ ...item.novo, url: item.url });
    }
  }

  console.log(`=== Atualizar exercício existente (${relatorio.atualizarExistente.length}) ===`);
  relatorio.atualizarExistente.forEach((r) => console.log(`  #${r.id} ${r.nome}`));

  console.log(`\n=== Criar exercício novo (${relatorio.criarNovo.length}) ===`);
  relatorio.criarNovo.forEach((r) => console.log(`  [${r.grupo_muscular}] ${r.nome}`));

  console.log(`\n=== Pulados/duplicados (${relatorio.pulados.length}) ===`);
  relatorio.pulados.forEach((r) => console.log(`  ${r.url} — ${r.motivo}`));

  if (relatorio.erros.length) {
    console.log(`\n=== ERROS (${relatorio.erros.length}) ===`);
    relatorio.erros.forEach((e) => console.log(`  ${e}`));
  }

  if (!commit) {
    console.log('\n[DRY RUN] Nada foi gravado. Rode com --commit pra gravar.');
    await pool.end();
    return;
  }

  console.log('\n[COMMIT] Gravando...');
  let atualizados = 0;
  let criados = 0;
  for (const r of relatorio.atualizarExistente) {
    await pool.query('UPDATE exercicios SET video_url = $1 WHERE id = $2', [r.url, r.id]);
    atualizados++;
  }
  for (const r of relatorio.criarNovo) {
    await pool.query(
      'INSERT INTO exercicios (nome, grupo_muscular, video_url) VALUES ($1, $2, $3)',
      [r.nome, r.grupo_muscular, r.url]
    );
    criados++;
  }
  console.log(`OK — ${atualizados} exercícios atualizados, ${criados} exercícios novos criados.`);
  await pool.end();
}

main();

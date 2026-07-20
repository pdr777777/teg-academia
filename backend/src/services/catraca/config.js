const { criarClienteCatraca } = require('./controlIdClient');

function catracasConfiguradas() {
  return [1, 2]
    .filter((n) => process.env[`CATRACA${n}_HOST`])
    .map((n) => criarClienteCatraca({
      nome: `catraca${n}`,
      host: process.env[`CATRACA${n}_HOST`],
      porta: process.env[`CATRACA${n}_PORT`] || '80',
      usuario: process.env[`CATRACA${n}_USER`],
      senha: process.env[`CATRACA${n}_PASSWORD`],
    }));
}

module.exports = { catracasConfiguradas };

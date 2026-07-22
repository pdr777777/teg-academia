function emailValido(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function telefoneValido(telefone) {
  if (typeof telefone !== 'string') return false;
  const digitos = telefone.replace(/\D/g, '');
  return digitos.length === 10 || digitos.length === 11;
}

// Algoritmo padrão de checksum de CPF (módulo 11). Rejeita também sequências
// de dígito repetido (111.111.111-11 etc.), que passam no checksum mas nunca
// são CPFs reais emitidos.
function cpfValido(cpf) {
  if (typeof cpf !== 'string') return false;
  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false;

  const calcularDigito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const d1 = calcularDigito(digitos.slice(0, 9));
  const d2 = calcularDigito(digitos.slice(0, 10));
  return d1 === Number(digitos[9]) && d2 === Number(digitos[10]);
}

module.exports = { emailValido, telefoneValido, cpfValido };

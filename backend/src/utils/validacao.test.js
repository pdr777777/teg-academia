const { emailValido, telefoneValido, cpfValido } = require('./validacao');

describe('emailValido', () => {
  test('aceita e-mails válidos', () => {
    expect(emailValido('aluno@teste.com')).toBe(true);
    expect(emailValido('a.b+c@sub.dominio.com.br')).toBe(true);
  });

  test('rejeita e-mails inválidos', () => {
    expect(emailValido('asd')).toBe(false);
    expect(emailValido('asd@')).toBe(false);
    expect(emailValido('@dominio.com')).toBe(false);
    expect(emailValido('asd @dominio.com')).toBe(false);
    expect(emailValido('')).toBe(false);
    expect(emailValido(undefined)).toBe(false);
  });
});

describe('telefoneValido', () => {
  test('aceita telefone com DDD, com ou sem máscara', () => {
    expect(telefoneValido('67999999999')).toBe(true);
    expect(telefoneValido('(67) 99999-9999')).toBe(true);
    expect(telefoneValido('6733334444')).toBe(true);
  });

  test('rejeita telefone com poucos ou muitos dígitos', () => {
    expect(telefoneValido('123')).toBe(false);
    expect(telefoneValido('123456789012')).toBe(false);
    expect(telefoneValido('')).toBe(false);
  });
});

describe('cpfValido', () => {
  test('aceita CPF com dígito verificador correto', () => {
    expect(cpfValido('111.444.777-35')).toBe(true);
    expect(cpfValido('11144477735')).toBe(true);
  });

  test('rejeita CPF com dígito verificador errado', () => {
    expect(cpfValido('111.444.777-36')).toBe(false);
  });

  test('rejeita sequência de dígito repetido', () => {
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('000.000.000-00')).toBe(false);
  });

  test('rejeita tamanho errado', () => {
    expect(cpfValido('123')).toBe(false);
    expect(cpfValido('')).toBe(false);
  });
});

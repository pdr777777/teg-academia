-- Os planos seed (Básico/Pro/Pro Semestral/Pro Anual) eram dado de exemplo,
-- desalinhado com a divulgação real da academia (Instagram). Mantém as linhas
-- por integridade histórica (matrículas/pagamentos já podem referenciar esses
-- IDs) mas desativa pra sumirem da vitrine pública.
UPDATE planos SET ativo = FALSE WHERE nome IN ('Básico', 'Pro', 'Pro Semestral', 'Pro Anual');

INSERT INTO planos (nome, descricao, preco_mensal, duracao_dias) VALUES
  ('Mensal', 'Cartão de débito ou crédito (R$129,90), ou Pix/dinheiro com desconto de 7,6%', 119.90, 30),
  ('Trimestral', '3x de R$109,90 no crédito', 109.90, 90),
  ('Anual', '12x R$109,90 recorrente no cartão, 12x R$99,90 parcelado (necessário limite de R$1.198,80), ou 12x R$109,90 recorrente no Pix', 99.90, 365);

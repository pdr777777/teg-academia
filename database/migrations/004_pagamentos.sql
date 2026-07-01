CREATE TABLE pagamentos (
  id SERIAL PRIMARY KEY,
  matricula_id INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  valor NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  metodo VARCHAR(20) CHECK (metodo IN ('pix', 'cartao', 'dinheiro', 'outro')),
  data_pagamento TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pagamentos_usuario_id ON pagamentos(usuario_id);
CREATE INDEX idx_pagamentos_matricula_id ON pagamentos(matricula_id);
CREATE INDEX idx_pagamentos_status ON pagamentos(status);
CREATE INDEX idx_pagamentos_created_at ON pagamentos(created_at);

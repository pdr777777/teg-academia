CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  telefone VARCHAR(20),
  cpf VARCHAR(14) UNIQUE,
  data_nascimento DATE,
  foto_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'aluno' CHECK (role IN ('aluno', 'professor', 'admin', 'dono')),
  link_indicacao VARCHAR(20) UNIQUE,
  indicado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  sequencia_atual INTEGER NOT NULL DEFAULT 0,
  maior_sequencia INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  senha_alterada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_role ON usuarios(role);
CREATE INDEX idx_usuarios_link_indicacao ON usuarios(link_indicacao);
CREATE INDEX idx_usuarios_indicado_por ON usuarios(indicado_por);

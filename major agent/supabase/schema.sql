-- ============================================================
-- BaseOp — Schema SQL completo para Supabase
-- Colar inteiro no SQL Editor do Supabase e executar uma vez
-- ============================================================

-- =====================
-- 1. TABELAS PRINCIPAIS
-- =====================

-- Projetos: cada frente de trabalho/iniciativa
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  objetivo text,
  estagio text NOT NULL DEFAULT 'descoberta'
    CHECK (estagio IN (
      'descoberta','planejamento','execução',
      'aguardando','pausado','concluído'
    )),
  status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','pausado','arquivado')),
  proxima_acao text,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Memória evolutiva dos projetos (versionada)
CREATE TABLE project_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resumo text NOT NULL,
  decisoes text[],
  proxima_acao text,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Entradas: qualquer captura via Telegram ou webapp
CREATE TABLE entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL
    CHECK (tipo IN (
      'insight','radar','me','search',
      'content','note','task_suggestion'
    )),
  conteudo text NOT NULL,
  resumo text,
  tags text[] DEFAULT '{}',
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  origem text NOT NULL DEFAULT 'telegram',
  telegram_message_id text,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Conversas do Telegram (agrupamento de mensagens)
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id text NOT NULL,
  titulo text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Mensagens individuais dentro de uma conversa
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  command text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Tarefas (com campo preparado para sync ClickUp fase 2)
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN (
      'pendente','em_execução','aguardando',
      'concluída','cancelada'
    )),
  sync_status text NOT NULL DEFAULT 'local'
    CHECK (sync_status IN ('local','syncing','synced','failed')),
  clickup_task_id text,
  sync_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =====================
-- 2. ÍNDICES
-- =====================

CREATE INDEX idx_entries_tipo ON entries(tipo);
CREATE INDEX idx_entries_project_id ON entries(project_id);
CREATE INDEX idx_entries_created_at ON entries(created_at DESC);
CREATE INDEX idx_entries_telegram_msg ON entries(telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);

CREATE INDEX idx_project_memory_project_id ON project_memory(project_id);
CREATE INDEX idx_project_memory_version ON project_memory(project_id, version DESC);

CREATE INDEX idx_conversations_chat_id ON conversations(telegram_chat_id);

-- =====================
-- 3. TRIGGER: updated_at
-- =====================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================
-- 4. ROW LEVEL SECURITY
-- =====================
-- Modelo single-user: apenas service_role acessa.
-- O frontend usa service_role via server ou
-- na fase 2 troca para auth com user_id.

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policies: acesso total para service_role
CREATE POLICY "service_role_all" ON projects
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON project_memory
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON entries
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON conversations
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON messages
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON tasks
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Policies: leitura pública para o webapp (anon key)
-- O webapp só lê dados, nunca escreve diretamente.
CREATE POLICY "anon_read" ON projects
  FOR SELECT USING (true);

CREATE POLICY "anon_read" ON project_memory
  FOR SELECT USING (true);

CREATE POLICY "anon_read" ON entries
  FOR SELECT USING (true);

CREATE POLICY "anon_read" ON conversations
  FOR SELECT USING (true);

CREATE POLICY "anon_read" ON messages
  FOR SELECT USING (true);

CREATE POLICY "anon_read" ON tasks
  FOR SELECT USING (true);

-- =====================
-- 5. REALTIME
-- =====================
-- Habilitar publicação Realtime para o dashboard

ALTER PUBLICATION supabase_realtime ADD TABLE entries;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- =====================
-- 6. FUNÇÃO UTILITÁRIA
-- =====================

-- Buscar ou criar conversa pelo chat_id do Telegram
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_chat_id text,
  p_titulo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM conversations
  WHERE telegram_chat_id = p_chat_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO conversations (telegram_chat_id, titulo)
    VALUES (p_chat_id, COALESCE(p_titulo, 'Conversa ' || p_chat_id))
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- Próxima versão de memória para um projeto
CREATE OR REPLACE FUNCTION next_memory_version(p_project_id uuid)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(MAX(version), 0) + 1
  FROM project_memory
  WHERE project_id = p_project_id;
$$;

// ============================================================
// BaseOp — Tipos TypeScript (espelham o schema SQL)
// ============================================================

// ----- Enums como union types -----

export type ProjectStage =
  | 'descoberta'
  | 'planejamento'
  | 'execução'
  | 'aguardando'
  | 'pausado'
  | 'concluído';

export type ProjectStatus = 'ativo' | 'pausado' | 'arquivado';

export type EntryType =
  | 'insight'
  | 'radar'
  | 'me'
  | 'search'
  | 'content'
  | 'note'
  | 'task_suggestion';

export type EntryOrigin = 'telegram' | 'webapp';

export type MessageRole = 'user' | 'assistant';

export type TaskStatus =
  | 'pendente'
  | 'em_execução'
  | 'aguardando'
  | 'concluída'
  | 'cancelada';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'failed';

// ----- Tabelas -----

export interface Project {
  id: string;
  nome: string;
  objetivo: string | null;
  estagio: ProjectStage;
  status: ProjectStatus;
  proxima_acao: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ProjectMemory {
  id: string;
  project_id: string;
  resumo: string;
  decisoes: string[] | null;
  proxima_acao: string | null;
  version: number;
  created_at: string;
}

export interface Entry {
  id: string;
  tipo: EntryType;
  conteudo: string;
  resumo: string | null;
  tags: string[];
  project_id: string | null;
  origem: EntryOrigin;
  telegram_message_id: string | null;
  processed: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  telegram_chat_id: string;
  titulo: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  command: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Task {
  id: string;
  titulo: string;
  descricao: string | null;
  project_id: string | null;
  status: TaskStatus;
  sync_status: SyncStatus;
  clickup_task_id: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

// ----- Tipos auxiliares para inserção (sem id/timestamps) -----

export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'updated_at'>;
export type EntryInsert = Omit<Entry, 'id' | 'created_at'>;
export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at'>;
export type MessageInsert = Omit<Message, 'id' | 'created_at'>;
export type ProjectMemoryInsert = Omit<ProjectMemory, 'id' | 'created_at'>;

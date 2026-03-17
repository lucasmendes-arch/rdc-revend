import {
  Circle,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Cloud,
  CloudOff,
} from 'lucide-react';
import type { Task, TaskStatus, SyncStatus } from '@/types';
import { formatDate, formatFullDate } from '@/lib/utils';

const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: typeof Circle; label: string; color: string }
> = {
  pendente: { icon: Circle, label: 'Pendente', color: 'text-zinc-400' },
  em_execução: { icon: Play, label: 'Em execução', color: 'text-blue-400' },
  aguardando: { icon: Pause, label: 'Aguardando', color: 'text-amber-400' },
  concluída: { icon: CheckCircle2, label: 'Concluída', color: 'text-green-400' },
  cancelada: { icon: XCircle, label: 'Cancelada', color: 'text-zinc-600' },
};

const SYNC_CONFIG: Record<
  SyncStatus,
  { icon: typeof Cloud; label: string; color: string }
> = {
  local: { icon: CloudOff, label: 'Local', color: 'text-zinc-600' },
  syncing: { icon: RefreshCw, label: 'Sincronizando', color: 'text-blue-400' },
  synced: { icon: Cloud, label: 'Synced', color: 'text-green-500' },
  failed: { icon: AlertTriangle, label: 'Falhou', color: 'text-red-400' },
};

interface Props {
  task: Task;
}

export default function TaskCard({ task }: Props) {
  const st = STATUS_CONFIG[task.status];
  const sync = SYNC_CONFIG[task.sync_status];
  const StatusIcon = st.icon;
  const SyncIcon = sync.icon;

  const isDone = task.status === 'concluída' || task.status === 'cancelada';

  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-lg p-4 transition-colors hover:border-zinc-700 ${
        isDone ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <StatusIcon size={18} className={`${st.color} shrink-0 mt-0.5`} />

        <div className="flex-1 min-w-0">
          <h4
            className={`text-sm font-medium ${
              isDone ? 'text-zinc-500 line-through' : 'text-white'
            }`}
          >
            {task.titulo}
          </h4>

          {task.descricao && (
            <p className="mt-1 text-xs text-zinc-500 line-clamp-2">
              {task.descricao}
            </p>
          )}

          <div className="flex items-center gap-3 mt-3 text-[11px]">
            <span className={st.color}>{st.label}</span>

            <span className={`flex items-center gap-1 ${sync.color}`}>
              <SyncIcon size={11} />
              {sync.label}
            </span>

            {task.sync_error && (
              <span className="text-red-400 truncate max-w-[200px]" title={task.sync_error}>
                {task.sync_error}
              </span>
            )}

            <time
              className="ml-auto text-zinc-700"
              title={formatFullDate(task.created_at)}
            >
              {formatDate(task.created_at)}
            </time>
          </div>
        </div>
      </div>
    </div>
  );
}

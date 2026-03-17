import { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import type { TaskStatus } from '@/types';
import PageWrapper from '@/components/layout/PageWrapper';
import TaskCard from '@/components/tasks/TaskCard';
import { CheckSquare } from 'lucide-react';

const STATUSES: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_execução', label: 'Em execução' },
  { value: 'aguardando', label: 'Aguardando' },
  { value: 'concluída', label: 'Concluída' },
  { value: 'cancelada', label: 'Cancelada' },
];

export default function Tasks() {
  const [status, setStatus] = useState<TaskStatus | null>(null);

  const { data: tasks = [], isLoading } = useTasks({ status });

  return (
    <PageWrapper
      title="Tarefas"
      subtitle={`${tasks.length} tarefa${tasks.length !== 1 ? 's' : ''}`}
    >
      <div className="space-y-6">
        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map(({ value, label }) => {
            const isActive =
              value === 'all' ? status === null : status === value;
            return (
              <button
                key={value}
                onClick={() =>
                  setStatus(value === 'all' ? null : (value as TaskStatus))
                }
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-zinc-900'
                    : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Task list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse"
              >
                <div className="flex items-start gap-3">
                  <div className="w-[18px] h-[18px] bg-zinc-800 rounded-full shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 bg-zinc-800 rounded w-1/2 mb-2" />
                    <div className="h-3 bg-zinc-800 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
            <CheckSquare size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">Nenhuma tarefa encontrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

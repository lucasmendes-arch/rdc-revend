import { Search } from 'lucide-react';
import type { ProjectStage, ProjectStatus } from '@/types';

const STAGES: { value: ProjectStage | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'descoberta', label: 'Descoberta' },
  { value: 'planejamento', label: 'Planejamento' },
  { value: 'execução', label: 'Execução' },
  { value: 'aguardando', label: 'Aguardando' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'concluído', label: 'Concluído' },
];

const STATUSES: { value: ProjectStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'arquivado', label: 'Arquivado' },
];

interface Props {
  selectedStage: ProjectStage | null;
  onStageChange: (stage: ProjectStage | null) => void;
  selectedStatus: ProjectStatus | null;
  onStatusChange: (status: ProjectStatus | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export default function ProjectFilter({
  selectedStage,
  onStageChange,
  selectedStatus,
  onStatusChange,
  search,
  onSearchChange,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            type="text"
            placeholder="Buscar projetos..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>

        {/* Status select */}
        <select
          value={selectedStatus ?? 'all'}
          onChange={(e) =>
            onStatusChange(e.target.value === 'all' ? null : (e.target.value as ProjectStatus))
          }
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
        >
          {STATUSES.map(({ value, label }) => (
            <option key={value} value={value}>
              Status: {label}
            </option>
          ))}
        </select>
      </div>

      {/* Stage chips */}
      <div className="flex gap-1.5 flex-wrap">
        {STAGES.map(({ value, label }) => {
          const isActive =
            value === 'all' ? selectedStage === null : selectedStage === value;
          return (
            <button
              key={value}
              onClick={() =>
                onStageChange(value === 'all' ? null : (value as ProjectStage))
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
    </div>
  );
}

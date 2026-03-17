import { Search } from 'lucide-react';
import type { EntryType } from '@/types';

const TYPES: { value: EntryType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'insight', label: 'Insight' },
  { value: 'radar', label: 'Radar' },
  { value: 'me', label: 'Pessoal' },
  { value: 'search', label: 'Pesquisa' },
  { value: 'content', label: 'Conteúdo' },
  { value: 'note', label: 'Nota' },
  { value: 'task_suggestion', label: 'Tarefa' },
];

interface Props {
  selectedType: EntryType | null;
  onTypeChange: (type: EntryType | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export default function EntryFilter({
  selectedType,
  onTypeChange,
  search,
  onSearchChange,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          type="text"
          placeholder="Buscar entradas..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      {/* Type chips */}
      <div className="flex gap-1.5 flex-wrap">
        {TYPES.map(({ value, label }) => {
          const isActive =
            value === 'all' ? selectedType === null : selectedType === value;
          return (
            <button
              key={value}
              onClick={() =>
                onTypeChange(value === 'all' ? null : (value as EntryType))
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

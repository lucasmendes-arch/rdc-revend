import {
  Lightbulb,
  Radar,
  User,
  Search,
  PenTool,
  StickyNote,
  ListChecks,
} from 'lucide-react';
import type { Entry, EntryType } from '@/types';
import { formatDate, formatFullDate } from '@/lib/utils';

const TYPE_CONFIG: Record<
  EntryType,
  { icon: typeof Lightbulb; label: string; color: string }
> = {
  insight: { icon: Lightbulb, label: 'Insight', color: 'text-amber-400' },
  radar: { icon: Radar, label: 'Radar', color: 'text-blue-400' },
  me: { icon: User, label: 'Pessoal', color: 'text-purple-400' },
  search: { icon: Search, label: 'Pesquisa', color: 'text-green-400' },
  content: { icon: PenTool, label: 'Conteúdo', color: 'text-pink-400' },
  note: { icon: StickyNote, label: 'Nota', color: 'text-zinc-400' },
  task_suggestion: { icon: ListChecks, label: 'Tarefa', color: 'text-cyan-400' },
};

interface Props {
  entry: Entry;
}

export default function EntryCard({ entry }: Props) {
  const config = TYPE_CONFIG[entry.tipo];
  const Icon = config.icon;

  return (
    <div className="group bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className={config.color} />
          <span className={`text-xs font-medium ${config.color}`}>
            {config.label}
          </span>
        </div>
        <time
          className="text-xs text-zinc-600 shrink-0"
          title={formatFullDate(entry.created_at)}
        >
          {formatDate(entry.created_at)}
        </time>
      </div>

      {/* Resumo ou conteúdo */}
      <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
        {entry.resumo || entry.conteudo}
      </p>

      {/* Conteúdo original (se tem resumo, mostra o original colapsado) */}
      {entry.resumo && (
        <p className="mt-1.5 text-xs text-zinc-600 line-clamp-2">
          {entry.conteudo}
        </p>
      )}

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-zinc-800 text-zinc-500 rounded text-[11px]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Origem */}
      <div className="flex items-center gap-2 mt-3 text-[11px] text-zinc-700">
        <span>via {entry.origem}</span>
        {entry.processed && <span>· processado</span>}
      </div>
    </div>
  );
}

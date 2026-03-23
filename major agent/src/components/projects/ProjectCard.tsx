import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Project, ProjectStage } from '@/types';
import { formatDate, formatFullDate } from '@/lib/utils';

const STAGE_CONFIG: Record<ProjectStage, { label: string; color: string }> = {
  descoberta: { label: 'Descoberta', color: 'bg-blue-500/20 text-blue-400' },
  planejamento: { label: 'Planejamento', color: 'bg-violet-500/20 text-violet-400' },
  execução: { label: 'Execução', color: 'bg-emerald-500/20 text-emerald-400' },
  aguardando: { label: 'Aguardando', color: 'bg-amber-500/20 text-amber-400' },
  pausado: { label: 'Pausado', color: 'bg-zinc-500/20 text-zinc-400' },
  concluído: { label: 'Concluído', color: 'bg-green-500/20 text-green-400' },
};

interface Props {
  project: Project;
  stale?: boolean;
}

export default function ProjectCard({ project, stale }: Props) {
  const stage = STAGE_CONFIG[project.estagio];

  return (
    <Link
      to={`/projects/${project.id}`}
      className="group block bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-white truncate">
              {project.nome}
            </h3>
            {stale && (
              <span className="shrink-0 w-2 h-2 rounded-full bg-amber-500" title="Sem atualização há 7+ dias" />
            )}
          </div>

          {project.objetivo && (
            <p className="mt-1 text-xs text-zinc-500 line-clamp-1">
              {project.objetivo}
            </p>
          )}

          {project.proxima_acao && (
            <p className="mt-2 text-xs text-zinc-400">
              <span className="text-zinc-600">Próxima →</span> {project.proxima_acao}
            </p>
          )}
        </div>

        <ChevronRight
          size={16}
          className="text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0 mt-0.5"
        />
      </div>

      <div className="flex items-center gap-2 mt-3">
        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${stage.color}`}>
          {stage.label}
        </span>

        {project.tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 bg-zinc-800 text-zinc-500 rounded text-[11px]"
          >
            {tag}
          </span>
        ))}

        <span
          className="ml-auto text-[11px] text-zinc-700"
          title={formatFullDate(project.updated_at)}
        >
          {formatDate(project.updated_at)}
        </span>
      </div>
    </Link>
  );
}

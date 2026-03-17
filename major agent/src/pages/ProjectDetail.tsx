import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { useProject } from '@/hooks/useProjects';
import { useEntries } from '@/hooks/useEntries';
import { useProjectMemory } from '@/hooks/useProjectMemory';
import PageWrapper from '@/components/layout/PageWrapper';
import EntryCard from '@/components/entries/EntryCard';
import MemoryTimeline from '@/components/memory/MemoryTimeline';
import { formatFullDate } from '@/lib/utils';
import type { ProjectStage } from '@/types';

const STAGE_CONFIG: Record<ProjectStage, { label: string; color: string }> = {
  descoberta: { label: 'Descoberta', color: 'bg-blue-500/20 text-blue-400' },
  planejamento: { label: 'Planejamento', color: 'bg-violet-500/20 text-violet-400' },
  execução: { label: 'Execução', color: 'bg-emerald-500/20 text-emerald-400' },
  aguardando: { label: 'Aguardando', color: 'bg-amber-500/20 text-amber-400' },
  pausado: { label: 'Pausado', color: 'bg-zinc-500/20 text-zinc-400' },
  concluído: { label: 'Concluído', color: 'bg-green-500/20 text-green-400' },
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading: loadingProject } = useProject(id);
  const { data: entries = [], isLoading: loadingEntries } = useEntries({
    projectId: id,
    limit: 20,
  });
  const { data: memories = [], isLoading: loadingMemory } = useProjectMemory(id);

  if (loadingProject) {
    return (
      <PageWrapper title="Carregando...">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-zinc-800 rounded w-1/3" />
          <div className="h-4 bg-zinc-800 rounded w-2/3" />
        </div>
      </PageWrapper>
    );
  }

  if (!project) {
    return (
      <PageWrapper title="Projeto não encontrado">
        <Link to="/projects" className="text-sm text-zinc-400 hover:text-white">
          ← Voltar para projetos
        </Link>
      </PageWrapper>
    );
  }

  const stage = STAGE_CONFIG[project.estagio];

  return (
    <PageWrapper
      title={project.nome}
      subtitle={project.objetivo ?? undefined}
      actions={
        <Link
          to="/projects"
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>
      }
    >
      <div className="space-y-8">
        {/* Info header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-2.5 py-1 rounded text-xs font-medium ${stage.color}`}>
              {stage.label}
            </span>
            <span className="px-2.5 py-1 rounded text-xs font-medium bg-zinc-800 text-zinc-400">
              {project.status}
            </span>
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-zinc-800 text-zinc-500 rounded text-[11px]"
              >
                {tag}
              </span>
            ))}
          </div>

          {project.proxima_acao && (
            <div className="mt-4 flex items-start gap-2 text-sm">
              <span className="text-zinc-600 shrink-0">Próxima ação:</span>
              <span className="text-zinc-300">{project.proxima_acao}</span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-600">
            <Clock size={12} />
            Atualizado em {formatFullDate(project.updated_at)}
          </div>
        </div>

        {/* Memory timeline */}
        <section>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">
            Memória do Projeto ({memories.length})
          </h3>
          {loadingMemory ? (
            <div className="animate-pulse h-20 bg-zinc-900 rounded-lg" />
          ) : memories.length === 0 ? (
            <p className="text-xs text-zinc-600">Nenhuma memória registrada ainda.</p>
          ) : (
            <MemoryTimeline memories={memories} />
          )}
        </section>

        {/* Linked entries */}
        <section>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">
            Entradas vinculadas ({entries.length})
          </h3>
          {loadingEntries ? (
            <div className="animate-pulse h-20 bg-zinc-900 rounded-lg" />
          ) : entries.length === 0 ? (
            <p className="text-xs text-zinc-600">Nenhuma entrada vinculada.</p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}

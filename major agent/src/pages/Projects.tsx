import { useState } from 'react';
import { useProjects } from '@/hooks/useProjects';
import type { ProjectStage, ProjectStatus } from '@/types';
import PageWrapper from '@/components/layout/PageWrapper';
import ProjectFilter from '@/components/projects/ProjectFilter';
import ProjectCard from '@/components/projects/ProjectCard';
import { FolderKanban } from 'lucide-react';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default function Projects() {
  const [estagio, setEstagio] = useState<ProjectStage | null>(null);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [search, setSearch] = useState('');

  const { data: projects = [], isLoading } = useProjects({
    estagio,
    status,
    search: search.length >= 2 ? search : undefined,
  });

  const now = Date.now();

  return (
    <PageWrapper
      title="Projetos"
      subtitle={`${projects.length} projeto${projects.length !== 1 ? 's' : ''}`}
    >
      <div className="space-y-6">
        <ProjectFilter
          selectedStage={estagio}
          onStageChange={setEstagio}
          selectedStatus={status}
          onStatusChange={setStatus}
          search={search}
          onSearchChange={setSearch}
        />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse"
              >
                <div className="h-4 bg-zinc-800 rounded w-1/3 mb-2" />
                <div className="h-3 bg-zinc-800 rounded w-2/3 mb-3" />
                <div className="h-3 bg-zinc-800 rounded w-20" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
            <FolderKanban size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">Nenhum projeto encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => {
              const stale =
                project.status === 'ativo' &&
                now - new Date(project.updated_at).getTime() > SEVEN_DAYS_MS;
              return (
                <ProjectCard key={project.id} project={project} stale={stale} />
              );
            })}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

import { useState } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { useProjectMemory } from '@/hooks/useProjectMemory';
import PageWrapper from '@/components/layout/PageWrapper';
import MemoryTimeline from '@/components/memory/MemoryTimeline';
import { Brain } from 'lucide-react';

export default function Memory() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { data: projects = [] } = useProjects({ status: 'ativo' });
  const { data: memories = [], isLoading } = useProjectMemory(
    selectedProjectId ?? undefined
  );

  return (
    <PageWrapper
      title="Memória"
      subtitle="Evolução de contexto dos projetos ao longo do tempo"
    >
      <div className="space-y-6">
        {/* Project selector */}
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedProjectId ?? ''}
            onChange={(e) =>
              setSelectedProjectId(e.target.value || null)
            }
            className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 max-w-sm"
          >
            <option value="">Selecione um projeto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>

          {selectedProjectId && memories.length > 0 && (
            <span className="text-xs text-zinc-600 self-center">
              {memories.length} versão{memories.length !== 1 ? 'ões' : ''}
            </span>
          )}
        </div>

        {/* Content */}
        {!selectedProjectId ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
            <Brain size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">
              Selecione um projeto para ver a evolução da memória
            </p>
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse ml-6"
              >
                <div className="h-3 bg-zinc-800 rounded w-16 mb-3" />
                <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2" />
                <div className="h-3 bg-zinc-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
            <Brain size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">
              Nenhuma memória registrada para este projeto
            </p>
          </div>
        ) : (
          <MemoryTimeline memories={memories} />
        )}
      </div>
    </PageWrapper>
  );
}

import type { ProjectMemory } from '@/types';
import { formatFullDate } from '@/lib/utils';

interface Props {
  memories: ProjectMemory[];
}

export default function MemoryTimeline({ memories }: Props) {
  return (
    <div className="relative space-y-4">
      {/* Vertical line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-800" />

      {memories.map((mem) => (
        <div key={mem.id} className="relative pl-6">
          {/* Dot */}
          <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-zinc-700 bg-zinc-900" />

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-400">
                v{mem.version}
              </span>
              <time className="text-[11px] text-zinc-600">
                {formatFullDate(mem.created_at)}
              </time>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed">
              {mem.resumo}
            </p>

            {mem.decisoes && mem.decisoes.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-zinc-600 mb-1">Decisões:</p>
                <ul className="space-y-1">
                  {mem.decisoes.map((d, i) => (
                    <li key={i} className="text-xs text-zinc-400 flex gap-1.5">
                      <span className="text-zinc-600 shrink-0">•</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mem.proxima_acao && (
              <div className="mt-3 text-xs">
                <span className="text-zinc-600">Próxima → </span>
                <span className="text-zinc-400">{mem.proxima_acao}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

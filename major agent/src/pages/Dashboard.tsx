import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban,
  Inbox,
  CheckSquare,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { useEntries } from '@/hooks/useEntries';
import { useProjects } from '@/hooks/useProjects';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useRealtime } from '@/hooks/useRealtime';
import PageWrapper from '@/components/layout/PageWrapper';
import EntryCard from '@/components/entries/EntryCard';
import ProjectCard from '@/components/projects/ProjectCard';

const ENTRIES_KEY = ['entries', { limit: 10 }];
const TASKS_KEY = ['tasks'];
const STATS_KEY = ['dashboard-stats'];

export default function Dashboard() {
  const { data: stats, isLoading: loadingStats } = useDashboardStats();
  const { data: recentEntries = [], isLoading: loadingEntries } = useEntries({
    limit: 10,
  });
  const { data: projects = [] } = useProjects({ status: 'ativo' });

  // Realtime: invalidar entries e tasks ao vivo
  useRealtime('entries', ENTRIES_KEY);
  useRealtime('tasks', TASKS_KEY);
  useRealtime('entries', STATS_KEY);
  useRealtime('tasks', STATS_KEY);

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const staleProjects = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.status === 'ativo' &&
          now - new Date(p.updated_at).getTime() > SEVEN_DAYS_MS
      ),
    [projects, now]
  );

  const statCards = [
    {
      label: 'Projetos ativos',
      value: stats?.activeProjects ?? '—',
      icon: FolderKanban,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Entradas hoje',
      value: stats?.entriesToday ?? '—',
      icon: Inbox,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Tarefas pendentes',
      value: stats?.pendingTasks ?? '—',
      icon: CheckSquare,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'Sem atualização 7d+',
      value: stats?.staleProjects ?? '—',
      icon: AlertTriangle,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
    },
  ];

  return (
    <PageWrapper title="Dashboard">
      <div className="space-y-8">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div
              key={label}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-zinc-500">{label}</span>
                <div className={`p-1.5 rounded-md ${bg}`}>
                  <Icon size={14} className={color} />
                </div>
              </div>
              <p
                className={`text-2xl font-semibold ${
                  loadingStats ? 'animate-pulse text-zinc-700' : 'text-white'
                }`}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Stale projects alert */}
        {staleProjects.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-amber-400" />
              <h3 className="text-sm font-medium text-amber-400">
                Projetos sem atualização há 7+ dias
              </h3>
            </div>
            <div className="space-y-2">
              {staleProjects.map((p) => (
                <ProjectCard key={p.id} project={p} stale />
              ))}
            </div>
          </div>
        )}

        {/* Recent entries feed */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-zinc-400">
              Últimas entradas
            </h3>
            <Link
              to="/entries"
              className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Ver todas <ArrowRight size={12} />
            </Link>
          </div>

          {loadingEntries ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse"
                >
                  <div className="h-3 bg-zinc-800 rounded w-20 mb-3" />
                  <div className="h-4 bg-zinc-800 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : recentEntries.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
              <Inbox size={32} strokeWidth={1} className="mx-auto text-zinc-700" />
              <p className="mt-2 text-sm text-zinc-600">
                Nenhuma entrada ainda. Envie algo no Telegram!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}

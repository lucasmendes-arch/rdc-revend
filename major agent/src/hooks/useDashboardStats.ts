import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface DashboardStats {
  activeProjects: number;
  entriesToday: number;
  pendingTasks: number;
  staleProjects: number;
}

async function fetchStats(): Promise<DashboardStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysISO = sevenDaysAgo.toISOString();

  const [projectsRes, entriesTodayRes, pendingTasksRes, staleRes] =
    await Promise.all([
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ativo'),
      supabase
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayISO),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendente'),
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ativo')
        .lt('updated_at', sevenDaysISO),
    ]);

  return {
    activeProjects: projectsRes.count ?? 0,
    entriesToday: entriesTodayRes.count ?? 0,
    pendingTasks: pendingTasksRes.count ?? 0,
    staleProjects: staleRes.count ?? 0,
  };
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchStats,
  });
}

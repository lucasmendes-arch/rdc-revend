import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Task, TaskStatus } from '@/types';

interface UseTasksOptions {
  status?: TaskStatus | null;
  projectId?: string | null;
}

async function fetchTasks({ status, projectId }: UseTasksOptions): Promise<Task[]> {
  let query = supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Task[];
}

export function useTasks(options: UseTasksOptions = {}) {
  return useQuery({
    queryKey: ['tasks', options],
    queryFn: () => fetchTasks(options),
  });
}

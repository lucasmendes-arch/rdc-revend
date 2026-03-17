import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ProjectMemory } from '@/types';

export function useProjectMemory(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-memory', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('project_memory')
        .select('*')
        .eq('project_id', projectId)
        .order('version', { ascending: false });
      if (error) throw error;
      return data as ProjectMemory[];
    },
    enabled: !!projectId,
  });
}

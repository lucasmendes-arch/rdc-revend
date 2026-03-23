import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Project, ProjectStage, ProjectStatus } from '@/types';

interface UseProjectsOptions {
  estagio?: ProjectStage | null;
  status?: ProjectStatus | null;
  search?: string;
}

async function fetchProjects({
  estagio,
  status,
  search,
}: UseProjectsOptions): Promise<Project[]> {
  let query = supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (estagio) {
    query = query.eq('estagio', estagio);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (search && search.trim().length > 0) {
    query = query.or(
      `nome.ilike.%${search}%,objetivo.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Project[];
}

export function useProjects(options: UseProjectsOptions = {}) {
  return useQuery({
    queryKey: ['projects', options],
    queryFn: () => fetchProjects(options),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Project;
    },
    enabled: !!id,
  });
}

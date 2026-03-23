import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Entry, EntryType } from '@/types';

interface UseEntriesOptions {
  tipo?: EntryType | null;
  projectId?: string | null;
  search?: string;
  limit?: number;
}

async function fetchEntries({
  tipo,
  projectId,
  search,
  limit = 50,
}: UseEntriesOptions): Promise<Entry[]> {
  let query = supabase
    .from('entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (tipo) {
    query = query.eq('tipo', tipo);
  }

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  if (search && search.trim().length > 0) {
    query = query.or(
      `conteudo.ilike.%${search}%,resumo.ilike.%${search}%`
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as Entry[];
}

export function useEntries(options: UseEntriesOptions = {}) {
  return useQuery({
    queryKey: ['entries', options],
    queryFn: () => fetchEntries(options),
  });
}

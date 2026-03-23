import { useState } from 'react';
import { useEntries } from '@/hooks/useEntries';
import type { EntryType } from '@/types';
import PageWrapper from '@/components/layout/PageWrapper';
import EntryFilter from '@/components/entries/EntryFilter';
import EntryFeed from '@/components/entries/EntryFeed';

export default function Entries() {
  const [tipo, setTipo] = useState<EntryType | null>(null);
  const [search, setSearch] = useState('');

  // Debounce simples: query só dispara com o valor atual
  // TanStack Query já agrupa por queryKey, então mudanças rápidas
  // geram no máximo 1 request por combinação de filtros
  const { data: entries = [], isLoading } = useEntries({
    tipo,
    search: search.length >= 2 ? search : undefined,
  });

  return (
    <PageWrapper
      title="Entradas"
      subtitle={`${entries.length} entrada${entries.length !== 1 ? 's' : ''}`}
    >
      <div className="space-y-6">
        <EntryFilter
          selectedType={tipo}
          onTypeChange={setTipo}
          search={search}
          onSearchChange={setSearch}
        />
        <EntryFeed entries={entries} isLoading={isLoading} />
      </div>
    </PageWrapper>
  );
}

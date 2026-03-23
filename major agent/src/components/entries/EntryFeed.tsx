import type { Entry } from '@/types';
import EntryCard from './EntryCard';
import { Inbox } from 'lucide-react';

interface Props {
  entries: Entry[];
  isLoading: boolean;
}

export default function EntryFeed({ entries, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse"
          >
            <div className="h-3 bg-zinc-800 rounded w-20 mb-3" />
            <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2" />
            <div className="h-3 bg-zinc-800 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
        <Inbox size={40} strokeWidth={1} />
        <p className="mt-3 text-sm">Nenhuma entrada encontrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <EntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

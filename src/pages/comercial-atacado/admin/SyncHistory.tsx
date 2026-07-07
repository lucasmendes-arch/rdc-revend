import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'

interface SyncRun {
  id: string
  status: string
  source: string
  triggered_by: string | null
  imported: number
  updated: number
  skipped: number
  errors: number
  error_message: string | null
  started_at: string
  finished_at: string | null
  admin_name: string | null
  admin_email: string | null
}

export default function AdminSyncHistory() {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['sync-history'],
    queryFn: async () => {
      // Fetch sync runs with admin profile info via a manual join
      const { data, error } = await supabase
        .from('catalog_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50)

      if (error) throw error

      const rows = (data || []) as Array<Omit<SyncRun, 'admin_name' | 'admin_email'>>

      // Collect unique triggered_by UUIDs to fetch names
      const adminIds = [...new Set(rows.map(r => r.triggered_by).filter(Boolean))] as string[]

      let profileMap = new Map<string, { full_name: string | null; email: string | null }>()
      if (adminIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', adminIds)

        for (const p of profiles || []) {
          profileMap.set(p.id, { full_name: p.full_name, email: null })
        }
      }

      return rows.map(r => ({
        ...r,
        admin_name: r.triggered_by ? profileMap.get(r.triggered_by)?.full_name || null : null,
        admin_email: r.triggered_by ? profileMap.get(r.triggered_by)?.email || null : null,
      })) as SyncRun[]
    },
    staleTime: 30 * 1000,
  })

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
      ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return '—'
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'success':
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Sucesso</span>
      case 'error':
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Erro</span>
      case 'running':
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full"><RefreshCw className="w-3 h-3 animate-spin" />Executando</span>
      default:
        return <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-50 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />{status}</span>
    }
  }

  const SourceBadge = ({ source }: { source: string }) => {
    switch (source) {
      case 'nuvemshop':
        return <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">Nuvemshop</span>
      case 'google_sheets':
        return <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Google Sheets</span>
      default:
        return <span className="text-xs font-medium text-gray-700 bg-gray-50 px-2 py-0.5 rounded-full">{source}</span>
    }
  }

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Histórico de Sincronizações</h1>
          <p className="text-sm text-muted-foreground mt-1">Últimas 50 execuções de sync do catálogo e estoque</p>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            Nenhuma sincronização registrada.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">Data/Hora</th>
                    <th className="px-4 py-3">Fonte</th>
                    <th className="px-4 py-3">Admin</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Importados</th>
                    <th className="px-4 py-3 text-right">Atualizados</th>
                    <th className="px-4 py-3 text-right">Erros</th>
                    <th className="px-4 py-3 text-right">Duração</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">{formatDate(run.started_at)}</td>
                      <td className="px-4 py-3"><SourceBadge source={run.source} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {run.admin_name || (run.triggered_by ? run.triggered_by.slice(0, 8) + '...' : '—')}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">{run.imported > 0 ? `+${run.imported}` : '0'}</td>
                      <td className="px-4 py-3 text-right font-medium text-amber-600">{run.updated > 0 ? run.updated : '0'}</td>
                      <td className="px-4 py-3 text-right font-medium text-red-600">{run.errors > 0 ? run.errors : '0'}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatDuration(run.started_at, run.finished_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Error detail expand (desktop) */}
            <div className="hidden md:block mt-4 space-y-2">
              {runs.filter(r => r.error_message).map((run) => (
                <details key={run.id} className="bg-red-50 border border-red-200 rounded-lg">
                  <summary className="px-4 py-2 text-xs text-red-700 cursor-pointer hover:text-red-900">
                    Erro em {formatDate(run.started_at)} — clique para ver
                  </summary>
                  <pre className="px-4 py-2 text-xs text-red-800 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                    {run.error_message}
                  </pre>
                </details>
              ))}
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="bg-white rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{formatDate(run.started_at)}</span>
                    <StatusBadge status={run.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <SourceBadge source={run.source} />
                    <span className="text-xs text-muted-foreground">
                      {run.admin_name || (run.triggered_by ? run.triggered_by.slice(0, 8) + '...' : 'N/A')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-green-600 font-medium">+{run.imported} novos</span>
                    <span className="text-amber-600 font-medium">{run.updated} atualizados</span>
                    {run.errors > 0 && <span className="text-red-600 font-medium">{run.errors} erros</span>}
                    <span className="text-muted-foreground ml-auto">{formatDuration(run.started_at, run.finished_at)}</span>
                  </div>
                  {run.error_message && (
                    <details className="bg-red-50 rounded-lg border border-red-200">
                      <summary className="px-3 py-1.5 text-xs text-red-700 cursor-pointer">Ver erro</summary>
                      <pre className="px-3 py-1.5 text-xs text-red-800 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                        {run.error_message}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}

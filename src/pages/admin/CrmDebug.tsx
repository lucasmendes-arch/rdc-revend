import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader, Search, RefreshCw, AlertCircle, FileText, Tag as TagIcon, Zap, PlayCircle, Clock, Plus, Trash2, X, ChevronDown, ChevronRight, MessageCircle } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { CustomerTimeline } from '@/components/admin/CustomerTimeline'
import { crmService } from '@/services/crm'
import { getTagColorClasses, getRunStatusInfo, parseRunMetadata } from '@/utils/crm'
import { useToast } from '@/hooks/use-toast'

export default function AdminCrmDebug() {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedTagToAdd, setSelectedTagToAdd] = useState('')
  const [isActing, setIsActing] = useState(false)
  const { toast } = useToast()

  // Handle Enter key for search
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setDebouncedSearch(searchTerm)
    }
  }

  // Debug query: fetch almost everything to inspect the CRM state
  const { data: crmState, isLoading, error, refetch } = useQuery({
    queryKey: ['crm-debug', debouncedSearch],
    queryFn: async () => {
      let targetUserId: string | null = null
      let clientProfile = null

      // If search term is provided, find the user first
      if (debouncedSearch) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(debouncedSearch)

        if (isUUID) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('id', debouncedSearch)
            .maybeSingle()
          if (profile) {
            targetUserId = profile.id
            clientProfile = profile
          }
        }

        if (!targetUserId) {
          const { data: byName } = await supabase
            .from('profiles')
            .select('id, full_name')
            .ilike('full_name', `%${debouncedSearch}%`)
            .limit(1)
          if (byName && byName.length > 0) {
            targetUserId = byName[0].id
            clientProfile = byName[0]
          }
        }

        if (!targetUserId) {
          const { data: byEmail } = await supabase
            .from('client_sessions')
            .select('user_id, email')
            .ilike('email', `%${debouncedSearch}%`)
            .not('user_id', 'is', null)
            .limit(1)
            .maybeSingle()
          if (byEmail?.user_id) {
            targetUserId = byEmail.user_id
            clientProfile = { id: byEmail.user_id, full_name: byEmail.email }
          }
        }
      }

      // Fetch global CRM config (Automations, Tags)
      const tags = await crmService.getTags()
      const automations = await crmService.getAutomations()

      // Fetch Global Runs
      let queryRuns = supabase
        .from('crm_automation_runs')
        .select(`
          *,
          automation:crm_automations (name)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (targetUserId) {
        queryRuns = queryRuns.eq('user_id', targetUserId)
      }

      const { data: runs } = await queryRuns

      // Fetch specific user data if target is set
      let userTags = []
      let userEvents = []
      let userSession = null

      if (targetUserId) {
        userTags = await crmService.getCustomerTags(targetUserId)
        
        const { data: sessionData } = await supabase
          .from('client_sessions')
          .select('*')
          .eq('user_id', targetUserId)
          .maybeSingle()
          
        userSession = sessionData

        const { data: eventsData } = await supabase
          .from('crm_events')
          .select('*')
          .eq('user_id', targetUserId)
          .order('created_at', { ascending: false })
          .limit(20)
        
        userEvents = eventsData || []
      }

      return {
        targetUserId,
        clientProfile,
        userSession,
        userTags,
        userEvents,
        tags,
        automations,
        runs: runs || []
      }
    },
    enabled: true // Always fetch global state initially
  })

  const handleAddTag = async () => {
    if (!crmState?.targetUserId || !selectedTagToAdd) return;
    setIsActing(true);
    try {
      await crmService.addCustomerTag(crmState.targetUserId, selectedTagToAdd, 'manual');
      toast({ title: 'Tag adicionada com sucesso' });
      setSelectedTagToAdd('');
      refetch();
    } catch (err: any) {
      toast({ title: 'Erro ao adicionar tag', description: err.message, variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  }

  const handleRemoveTag = async (tagId: string) => {
    if (!crmState?.targetUserId) return;
    setIsActing(true);
    try {
      await crmService.removeCustomerTag(crmState.targetUserId, tagId);
      toast({ title: 'Tag removida com sucesso' });
      refetch();
    } catch (err: any) {
      toast({ title: 'Erro ao remover tag', description: err.message, variant: 'destructive' });
    } finally {
      setIsActing(false);
    }
  }

  const handleToggleAutomation = async (id: string, currentIsActive: boolean) => {
    setIsActing(true)
    try {
      await crmService.toggleAutomation(id, !currentIsActive)
      toast({ title: currentIsActive ? 'Automação desativada' : 'Automação ativada' })
      refetch()
    } catch (err: any) {
      toast({ title: 'Erro ao alterar automação', description: err.message, variant: 'destructive' })
    } finally {
      setIsActing(false)
    }
  }

  const handleDispatch = async (automationId: string) => {
    if (!crmState?.targetUserId) return
    setIsActing(true)
    try {
      const result = await crmService.dispatchManual(crmState.targetUserId, automationId)
      if (result.dispatched > 0) {
        toast({ title: 'Mensagem enviada com sucesso!' })
      } else if (result.skipped > 0) {
        toast({ title: 'Já enviado anteriormente', description: 'Delete o run correspondente para reenviar.' })
      } else {
        toast({ title: 'Não enviado', description: result.reason ?? 'Verifique os logs.', variant: 'destructive' })
      }
      refetch()
    } catch (err: any) {
      toast({ title: 'Erro no disparo', description: err.message, variant: 'destructive' })
    } finally {
      setIsActing(false)
    }
  }

  return (
    <AdminLayout>
      <div className="bg-white border-b border-border sticky top-0 lg:top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">CRM Global Debug</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Painel técnico para diagnóstico de tags, automações e eventos.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-surface text-foreground border border-border rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar Status
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">

        {/* --- Search Bar --- */}
        <div className="bg-white p-4 rounded-xl border border-border shadow-sm">
          <label className="block text-sm font-semibold text-foreground mb-2">Buscar Cliente (Contexto de Usuário)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Busque por User ID, Nome ou Email e aperte Enter..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            </div>
            <button
              onClick={() => setDebouncedSearch(searchTerm)}
              className="px-4 py-2 bg-foreground text-white rounded-lg text-sm font-semibold hover:bg-foreground/90 transition-colors whitespace-nowrap"
            >
              Buscar
            </button>
            {debouncedSearch && (
              <button
                onClick={() => {
                  setSearchTerm('')
                  setDebouncedSearch('')
                }}
                className="px-4 py-2 bg-surface text-foreground border border-border rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Erro ao carregar dados do CRM</p>
              <p className="text-sm mt-1">{(error as Error).message}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
            <Loader className="w-8 h-8 animate-spin text-gold-text mb-4" />
            <p>Sincronizando estado do CRM...</p>
          </div>
        ) : crmState ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* -- Left Column: User Context (if searching) or System Summary -- */}
            <div className="lg:col-span-1 space-y-6">
              
              {crmState.targetUserId ? (
                <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-border bg-slate-50">
                    <h2 className="font-bold text-foreground flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-500" />
                      Contexto do Cliente
                    </h2>
                  </div>
                  <div className="p-4 space-y-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Identificação</p>
                      <p className="font-medium">{crmState.clientProfile?.full_name || 'Desconhecido'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono break-all">{crmState.targetUserId}</p>
                    </div>
                    
                    {crmState.userSession && (
                      <div className="pt-3 border-t border-border/50">
                        <p className="text-muted-foreground text-xs mb-1">Status no Funil</p>
                        <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                          {crmState.userSession.status}
                        </span>
                        <p className="text-xs text-muted-foreground mt-2">
                          Atualizado: {new Date(crmState.userSession.updated_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl border border-border p-5 text-center">
                  <p className="text-sm text-muted-foreground mb-2">Contexto Global (Nenhum cliente selecionado)</p>
                  <p className="text-xs text-slate-400">Use a busca acima para inspecionar um cliente específico.</p>
                </div>
              )}

              {/* Tags Ativas (If User found) */}
              {crmState.targetUserId && (
                <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-border bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-foreground flex items-center gap-2">
                        <TagIcon className="w-4 h-4 text-slate-500" />
                        Tags Vinculadas
                      </h2>
                      <span className="text-xs font-bold text-muted-foreground bg-white px-2 py-0.5 rounded border border-border">{crmState.userTags.length}</span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <select 
                        className="flex-1 sm:w-48 text-xs border border-input rounded p-1.5 focus:ring-1 focus:ring-amber-400 focus:outline-none bg-white"
                        value={selectedTagToAdd}
                        onChange={(e) => setSelectedTagToAdd(e.target.value)}
                        disabled={isActing}
                      >
                        <option value="">Selecione uma tag...</option>
                        {crmState.tags.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                        ))}
                      </select>
                      <button 
                        onClick={handleAddTag} 
                        disabled={!selectedTagToAdd || isActing}
                        className="p-1.5 bg-foreground text-white rounded hover:bg-foreground/90 disabled:opacity-50 transition-colors"
                        title="Adicionar tag manualmente"
                      >
                        {isActing ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    {crmState.userTags.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic text-center py-4">Nenhuma tag ativa</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                        {crmState.userTags.map((ct) => (
                          <div 
                            key={ct.id} 
                            className={`flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full border text-xs font-medium shadow-sm ${getTagColorClasses(ct.tag?.slug || '')}`}
                            title={`Origem: ${ct.source}${ct.assigned_by ? ` | Por: ${ct.assigned_by}` : ''}\nAtribuída em: ${new Date(ct.assigned_at).toLocaleString('pt-BR')}`}
                          >
                            <span>{ct.tag?.name || ct.tag_id}</span>
                            <button 
                               onClick={() => handleRemoveTag(ct.tag_id)}
                               disabled={isActing}
                               className="p-0.5 rounded-full hover:bg-black/10 transition-colors disabled:opacity-50 opacity-70 hover:opacity-100 flex items-center justify-center pt-0.5"
                               title="Remover"
                             >
                                <X className="w-3 h-3" />
                             </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* User CRM Events (If User found) */}
              {crmState.targetUserId && (
                <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-border bg-slate-50 flex items-center justify-between">
                    <h2 className="font-bold text-foreground flex items-center gap-2">
                      <Zap className="w-4 h-4 text-slate-500" />
                      Eventos CRM Recentes
                    </h2>
                    <span className="text-xs font-bold text-muted-foreground bg-white px-2 py-0.5 rounded border border-border">{crmState.userEvents.length}</span>
                  </div>
                  <div className="p-4">
                    {crmState.userEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic text-center py-4">Nenhum evento registrado</p>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                        {crmState.userEvents.map((evt: any) => (
                          <div key={evt.id} className="border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{evt.event_type}</span>
                              <span className="text-[10px] text-muted-foreground">{new Date(evt.created_at).toLocaleString('pt-BR')}</span>
                            </div>
                            {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                               <pre className="text-[9px] text-slate-500 font-mono overflow-x-auto mt-1 p-1.5 bg-slate-50 rounded">
                                 {JSON.stringify(evt.metadata, null, 2)}
                               </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Customer Timeline (if user found and has phone) */}
              {crmState.targetUserId && crmState.userSession?.phone && (
                <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                  <CustomerTimeline phone={crmState.userSession.phone} />
                </div>
              )}

              {/* Global Config Summary */}
              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-border bg-slate-50">
                  <h2 className="font-bold text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                    Motor de Automações
                  </h2>
                </div>
                <div className="p-4 space-y-6">
                  <div>
                    <div className="space-y-3">
                      {crmState.automations.length === 0 ? (
                         <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                           <Zap className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                           <p className="text-sm font-semibold text-slate-600">Nenhuma automação configurada</p>
                           <p className="text-xs text-slate-400 mt-1">As regras do motor aparecerão aqui.</p>
                         </div>
                      ) : (
                        crmState.automations.map(auto => (
                          <div key={auto.id} className="relative bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-200 transition-colors group">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-slate-800 text-[14px] leading-none">{auto.name}</h3>
                                <div className="flex items-center gap-1.5 mt-2">
                                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                    Trigger: {auto.trigger_type}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() => handleToggleAutomation(auto.id, auto.is_active)}
                                disabled={isActing}
                                className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors disabled:opacity-50 cursor-pointer ${
                                  auto.is_active
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                                }`}
                                title={auto.is_active ? 'Clique para desativar' : 'Clique para ativar'}
                              >
                                {auto.is_active ? 'Ativa' : 'Inativa'}
                              </button>
                            </div>
                            {auto.description && (
                              <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">{auto.description}</p>
                            )}
                            {crmState.targetUserId && (
                              <button
                                onClick={() => handleDispatch(auto.id)}
                                disabled={isActing}
                                className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50"
                                title="Disparar mensagem WhatsApp para este cliente agora"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                Disparar agora
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-border/50">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Dicionário de Tags Global</h3>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {crmState.tags.length === 0 ? (
                         <p className="text-xs text-muted-foreground italic w-full text-center py-2">Banco vazio</p>
                      ) : (
                        crmState.tags.map(tag => (
                          <span key={tag.id} className={`inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-full border shadow-sm ${getTagColorClasses(tag.slug)}`} title={tag.type}>
                            {tag.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* -- Right Column: Runs Log -- */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden h-full flex flex-col">
                <div className="p-4 border-b border-border bg-slate-50 flex items-center justify-between">
                  <h2 className="font-bold text-foreground flex items-center gap-2">
                    <PlayCircle className="w-4 h-4 text-slate-500" />
                    Últimas Execuções (Runs)
                    {debouncedSearch && <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded ml-2">Filtrado (Target)</span>}
                  </h2>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium bg-white px-2 py-1 rounded border border-border">
                    <Clock className="w-3 h-3" /> Exibindo {crmState.runs.length} logs
                  </span>
                </div>
                
                <div className="flex-1 p-4 lg:p-6 bg-slate-50/50 overflow-y-auto min-h-[500px] custom-scrollbar">
                  {crmState.runs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <div className="w-16 h-16 bg-white text-slate-300 rounded-full flex items-center justify-center border border-slate-200 shadow-sm mb-4">
                         <PlayCircle className="w-8 h-8" />
                      </div>
                      <p className="text-base font-bold text-slate-700">Painel de Disparos Vazio</p>
                      <p className="text-sm text-slate-500 mt-2 max-w-sm">
                        O motor de automação ainda não realizou envios para {debouncedSearch ? 'este cliente' : 'o sistema'}.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {crmState.runs.map(run => {
                        const statusInfo = getRunStatusInfo(run.status as any)
                        const meta = parseRunMetadata(run.action_payload) as any
                        
                        const isWhatsApp = run.automation?.name?.toLowerCase().includes('whatsapp') || meta?.phone || meta?.template_name
                        const ActionIcon = isWhatsApp ? MessageCircle : PlayCircle
                        const iconColor = isWhatsApp ? 'text-emerald-500' : 'text-blue-500'
                        
                        return (
                          <div key={run.id} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all duration-200 group relative">
                            {/* Run Header */}
                            <div className="flex items-start justify-between mb-4 border-b border-slate-100 pb-3">
                              <div className="flex gap-3.5 items-start">
                                <div className={`mt-0.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100 group-hover:bg-white group-hover:border-${isWhatsApp ? 'emerald' : 'blue'}-100 transition-colors`}>
                                  <ActionIcon className={`w-5 h-5 ${iconColor}`} />
                                </div>
                                <div>
                                  <h3 className="font-bold text-slate-800 text-[14px]">
                                    {run.automation?.name || run.automation_id}
                                  </h3>
                                  <div className="flex items-center flex-wrap gap-2 mt-1.5">
                                    <span className="text-[11px] font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 border border-slate-200 rounded shrink-0" title={run.user_id}>
                                      User: {run.user_id?.split('-')[0]}...
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1 shrink-0">
                                      <Clock className="w-3 h-3 text-slate-400" /> 
                                      {new Date(run.created_at).toLocaleString('pt-BR', { 
                                        day: '2-digit', month: '2-digit', 
                                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <span className={`inline-flex items-center text-[10px] sm:text-[11px] font-bold px-2.5 py-1 rounded-full border shadow-sm shrink-0 whitespace-nowrap ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                            
                            {/* Operational Target Body */}
                            {(meta?.phone || meta?.template_name) && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 text-xs">
                                {meta.phone && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-bold w-14">Destino:</span>
                                    <span className="font-mono text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{meta.phone}</span>
                                  </div>
                                )}
                                {meta.template_name && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-bold w-16">Template:</span>
                                    <span className="font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 truncate" title={meta.template_name}>{meta.template_name}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Error Details */}
                            {run.error_message && (
                              <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs leading-relaxed text-red-700 font-mono break-all whitespace-pre-wrap shadow-sm">
                                <span className="font-bold block mb-1">Motivo da Falha:</span>
                                {run.error_message}
                              </div>
                            )}

                            {/* Metadata JSON Viewer - Collapsible */}
                            {meta && Object.keys(meta).length > 0 && (
                              <details className="mt-4 group/details bg-slate-50 border border-slate-200 rounded-lg overflow-hidden transition-all">
                                <summary className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase p-2.5 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-700 flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-200">
                                  <ChevronRight className="w-3.5 h-3.5 group-open/details:hidden" />
                                  <ChevronDown className="w-3.5 h-3.5 hidden group-open/details:block" />
                                  Payload Bruto (Dev)
                                </summary>
                                <div className="p-3 border-t border-slate-200 bg-white">
                                  <pre className="text-[10px] sm:text-[11px] text-slate-700 font-mono overflow-x-auto leading-relaxed">
                                    {JSON.stringify(meta, null, 2)}
                                  </pre>
                                </div>
                              </details>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        ) : null}
      </div>
    </AdminLayout>
  )
}

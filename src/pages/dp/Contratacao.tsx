import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader, Store as StoreIcon, Eye, EyeOff } from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ProcessoDetailModal from '@/components/dp/ProcessoDetailModal'
import {
  EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_TYPE_OPTIONS, STAGE_COLUMNS_BY_EMPLOYMENT_TYPE, getStageColumn,
  type EmploymentType, type StageColumn,
} from '@/lib/dpConstants'
import type { Processo } from '@/lib/dpTypes'

interface Store { id: string; name: string }

function ProcessoCard({ processo, onOpen }: { processo: Processo; onOpen: (p: Processo) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: processo.id })
  const col = getStageColumn(processo.employment_type, processo.current_stage)
  const style = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : null),
    borderLeftColor: col?.accent,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && onOpen(processo)}
      className={`bg-white rounded-lg border border-border/60 border-l-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] p-2.5 space-y-1.5 cursor-grab active:cursor-grabbing touch-none select-none ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <p className="text-[13px] font-semibold text-foreground truncate">{processo.candidates?.name || 'Candidato removido'}</p>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[#CCFBF1] text-[#0D9488] truncate max-w-full">
          {processo.role_title}
        </span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-surface-alt text-muted-foreground truncate max-w-full">
          {processo.stores?.name || '—'}
        </span>
      </div>
    </div>
  )
}

function StageColumnView({
  column, processos, onOpen,
}: {
  column: StageColumn
  processos: Processo[]
  onOpen: (p: Processo) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage })
  return (
    <section className="w-56 shrink-0 space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: column.accent }} />
        <h2 className="text-[11px] font-bold uppercase tracking-wide truncate text-muted-foreground">{column.label}</h2>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-alt text-muted-foreground shrink-0">
          {processos.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        style={{ backgroundColor: column.bg, borderColor: isOver ? column.accent : undefined }}
        className={`space-y-2 min-h-[80px] rounded-2xl border p-1.5 transition-colors ${isOver ? '' : 'border-dashed border-border/70'}`}
      >
        {processos.map((p) => (
          <ProcessoCard key={p.id} processo={p} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

export default function DpContratacao() {
  const queryClient = useQueryClient()
  const [storeId, setStoreId] = useState('')
  const [employmentType, setEmploymentType] = useState<EmploymentType>('clt')
  const [showFinalizados, setShowFinalizados] = useState(false)
  const [activeProcesso, setActiveProcesso] = useState<Processo | null>(null)
  const [detailProcesso, setDetailProcesso] = useState<Processo | null>(null)
  const [confirmEncerrar, setConfirmEncerrar] = useState<Processo | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ['dp-stores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name').order('name')
      if (error) throw error
      return (data || []) as Store[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const processosQueryKey = ['dp-processos', storeId, employmentType, showFinalizados]

  const { data: processos = [], isLoading } = useQuery<Processo[]>({
    queryKey: processosQueryKey,
    queryFn: async () => {
      let query = supabase
        .from('employee_processes')
        .select('id, candidate_id, employment_type, store_id, role_title, current_stage, status, started_at, activated_at, onboarding_completed, training_applicable, training_completed, created_at, candidates(id, name, whatsapp, photo_url), stores(name)')
        .eq('employment_type', employmentType)
        .order('started_at', { ascending: false })
      if (storeId) query = query.eq('store_id', storeId)
      if (!showFinalizados) query = query.eq('status', 'em_andamento')
      const { data, error } = await query
      if (error) throw error
      return (data || []) as unknown as Processo[]
    },
  })

  const columns = STAGE_COLUMNS_BY_EMPLOYMENT_TYPE[employmentType]

  const processosByStage = useMemo(() => {
    const map = new Map<string, Processo[]>()
    columns.forEach((c) => map.set(c.stage, []))
    processos.forEach((p) => map.get(p.current_stage)?.push(p))
    return map
  }, [processos, columns])

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from('employee_processes').update({ current_stage: stage }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: processosQueryKey })
      const previous = queryClient.getQueryData<Processo[]>(processosQueryKey)
      queryClient.setQueryData<Processo[]>(processosQueryKey, (old) =>
        (old || []).map((p) => (p.id === id ? { ...p, current_stage: stage } : p))
      )
      return { previous }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(processosQueryKey, context.previous)
      toast.error(`Erro ao mover: ${err instanceof Error ? err.message : 'desconhecido'}`)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['dp-processos'] }),
  })

  // "encerrado" é decisão negativa — pede confirmação antes de commitar (via
  // drag ou via <select> da aba Estágio), diferente das demais transições.
  function requestStageChange(processo: Processo, newStage: string) {
    if (processo.current_stage === newStage) return
    if (newStage === 'encerrado') {
      setConfirmEncerrar(processo)
      return
    }
    updateStage.mutate({ id: processo.id, stage: newStage })
    setDetailProcesso((prev) => (prev && prev.id === processo.id ? { ...prev, current_stage: newStage } : prev))
  }

  function confirmEncerrarProcesso() {
    if (!confirmEncerrar) return
    updateStage.mutate({ id: confirmEncerrar.id, stage: 'encerrado' })
    setDetailProcesso((prev) => (prev && prev.id === confirmEncerrar.id ? { ...prev, current_stage: 'encerrado' } : prev))
    setConfirmEncerrar(null)
  }

  function handleDragStart(event: DragStartEvent) {
    const p = processos.find((proc) => proc.id === event.active.id)
    setActiveProcesso(p || null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveProcesso(null)
    const { active, over } = event
    if (!over) return
    const processo = processos.find((p) => p.id === active.id)
    if (!processo) return
    requestStageChange(processo, over.id as string)
  }

  return (
    <AdminLayout>
      <div className="bg-card border-b border-border sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Contratação</h1>
            <p className="text-sm text-muted-foreground mt-1">Admissão pós-contratação, por tipo de vínculo</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background">
              <StoreIcon className="w-4 h-4 text-muted-foreground" />
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="bg-transparent text-sm font-medium text-foreground focus:outline-none"
              >
                <option value="">Todas as unidades</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowFinalizados((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-alt transition-colors"
              title={showFinalizados ? 'Ocultar efetivados/encerrados' : 'Mostrar efetivados/encerrados'}
            >
              {showFinalizados ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="hidden sm:inline">{showFinalizados ? 'Ocultar finalizados' : 'Mostrar finalizados'}</span>
            </button>
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-3">
          <Tabs value={employmentType} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
            <TabsList>
              {EMPLOYMENT_TYPE_OPTIONS.map((tv) => (
                <TabsTrigger key={tv} value={tv}>{EMPLOYMENT_TYPE_LABELS[tv]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 animate-spin text-gold-text mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {columns.map((col) => (
                <StageColumnView
                  key={col.stage}
                  column={col}
                  processos={processosByStage.get(col.stage) || []}
                  onOpen={setDetailProcesso}
                />
              ))}
            </div>
            <DragOverlay>
              {activeProcesso ? (
                <div
                  className="bg-white rounded-lg border border-border/60 border-l-4 shadow-lg p-2.5 w-56"
                  style={{ borderLeftColor: getStageColumn(activeProcesso.employment_type, activeProcesso.current_stage)?.accent }}
                >
                  <p className="text-[13px] font-semibold text-foreground truncate">{activeProcesso.candidates?.name}</p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {detailProcesso && (
        <ProcessoDetailModal
          processo={detailProcesso}
          onClose={() => setDetailProcesso(null)}
          estagio={{
            mode: 'kanban',
            columns: STAGE_COLUMNS_BY_EMPLOYMENT_TYPE[detailProcesso.employment_type],
            onChangeStage: (newStage) => requestStageChange(detailProcesso, newStage),
          }}
        />
      )}

      {/* Modal: confirmação de encerramento (decisão negativa) */}
      {confirmEncerrar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setConfirmEncerrar(null)} />
          <div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-foreground mb-1">Encerrar processo?</h2>
            <p className="text-sm text-muted-foreground mb-5">
              {confirmEncerrar.candidates?.name} sai do fluxo ativo de admissão. O registro é mantido, não é apagado.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmEncerrarProcesso}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
              >
                Encerrar
              </button>
              <button onClick={() => setConfirmEncerrar(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

// crmFilters.ts — Predicados puros para filtros operacionais do CRM
// Usados em AdminClientes para filtrar sessões por critério comercial.
// Cada predicado recebe uma sessão enriquecida (com campos de get_all_profiles)
// e retorna boolean. Mantidos separados para facilitar testes e reutilização.

export interface CrmFilterSession {
  user_id: string | null
  created_at: string
  profile: {
    customer_segment: string | null
    next_action: string | null
    next_action_at: string | null
    total_orders: number | bigint
    last_order_at: string | null
    first_order_at: string | null
    seller_id: string | null
  } | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24
const now = () => Date.now()

function daysSince(isoDate: string | null | undefined): number {
  if (!isoDate) return Infinity
  return (now() - new Date(isoDate).getTime()) / MS_PER_DAY
}

function totalOrders(session: CrmFilterSession): number {
  const v = session.profile?.total_orders
  if (v == null) return 0
  return Number(v)
}

// --------------------------------------------------------------------------
// Predicados exportados
// --------------------------------------------------------------------------

/** Cliente sem pedido há mais de 30 dias (ou nunca comprou e cadastrado há > 30d) */
export function isSemPedido30d(session: CrmFilterSession): boolean {
  if (!session.user_id || !session.profile) return false
  const orders = totalOrders(session)
  if (orders === 0) return daysSince(session.created_at) > 30
  return daysSince(session.profile.last_order_at) > 30
}

/** Cliente sem pedido há mais de 60 dias (ou nunca comprou e cadastrado há > 60d) */
export function isSemPedido60d(session: CrmFilterSession): boolean {
  if (!session.user_id || !session.profile) return false
  const orders = totalOrders(session)
  if (orders === 0) return daysSince(session.created_at) > 60
  return daysSince(session.profile.last_order_at) > 60
}

/** Novo cadastro (< 7 dias) sem nenhum pedido */
export function isNovoSemPrimeiroPedido(session: CrmFilterSession): boolean {
  if (!session.user_id || !session.profile) return false
  return (
    daysSince(session.created_at) < 7 &&
    totalOrders(session) === 0
  )
}

/** Parceiro da rede sem pedido há mais de 30 dias */
export function isParceiroInativo(session: CrmFilterSession): boolean {
  if (!session.user_id || !session.profile) return false
  if (session.profile.customer_segment !== 'network_partner') return false
  const orders = totalOrders(session)
  if (orders === 0) return true
  return daysSince(session.profile.last_order_at) > 30
}

/** Sem próxima ação definida */
export function isSemProximaAcao(session: CrmFilterSession): boolean {
  if (!session.user_id || !session.profile) return false
  return !session.profile.next_action
}

/** Follow-up agendado já venceu */
export function isFollowUpVencido(session: CrmFilterSession): boolean {
  if (!session.user_id || !session.profile) return false
  if (!session.profile.next_action_at) return false
  return new Date(session.profile.next_action_at).getTime() < now()
}

/** Follow-up agendado para hoje (independente de já ter vencido no dia) */
export function isFollowUpHoje(session: CrmFilterSession): boolean {
  if (!session.user_id || !session.profile) return false
  if (!session.profile.next_action_at) return false
  const d = new Date(session.profile.next_action_at)
  const today = new Date()
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

// --------------------------------------------------------------------------
// Catálogo de filtros para o dropdown do admin
// --------------------------------------------------------------------------

export interface OperationalFilter {
  key: string
  label: string
  predicate: (session: CrmFilterSession) => boolean
}

export const OPERATIONAL_FILTERS: OperationalFilter[] = [
  {
    key: 'sem_pedido_30d',
    label: 'Sem pedido há 30d',
    predicate: isSemPedido30d,
  },
  {
    key: 'sem_pedido_60d',
    label: 'Sem pedido há 60d',
    predicate: isSemPedido60d,
  },
  {
    key: 'novo_sem_primeiro_pedido',
    label: 'Novo sem 1º pedido',
    predicate: isNovoSemPrimeiroPedido,
  },
  {
    key: 'parceiro_inativo',
    label: 'Parceiro inativo',
    predicate: isParceiroInativo,
  },
  {
    key: 'sem_proxima_acao',
    label: 'Sem próxima ação',
    predicate: isSemProximaAcao,
  },
  {
    key: 'followup_vencido',
    label: 'Follow-up vencido',
    predicate: isFollowUpVencido,
  },
  {
    key: 'followup_hoje',
    label: 'Follow-up hoje',
    predicate: isFollowUpHoje,
  },
]

// --------------------------------------------------------------------------
// Fila comercial — priorização e ordenação
// --------------------------------------------------------------------------

/**
 * Prioridade de exibição na fila comercial.
 * Ordem de urgência: vencido > hoje > sem_acao > futuro
 */
export type QueuePriority = 'vencido' | 'hoje' | 'sem_acao' | 'futuro'

const PRIORITY_ORDER: Record<QueuePriority, number> = {
  vencido: 0,
  hoje: 1,
  sem_acao: 2,
  futuro: 3,
}

export function getQueuePriority(session: CrmFilterSession): QueuePriority {
  if (isFollowUpVencido(session)) return 'vencido'
  if (isFollowUpHoje(session)) return 'hoje'
  if (isSemProximaAcao(session)) return 'sem_acao'
  return 'futuro'
}

/**
 * Ordena sessões para a fila comercial.
 * Critério primário: prioridade (vencido → hoje → sem_acao → futuro)
 * Critério secundário: data mais crítica primeiro (mais antiga primeiro para vencidos,
 * mais cedo primeiro para futuros, data de criação para sem_acao)
 */
export function sortWorkQueue<T extends CrmFilterSession>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    const pa = PRIORITY_ORDER[getQueuePriority(a)]
    const pb = PRIORITY_ORDER[getQueuePriority(b)]
    if (pa !== pb) return pa - pb

    // Dentro do mesmo nível: data mais crítica primeiro
    const da = a.profile?.next_action_at
      ? new Date(a.profile.next_action_at).getTime()
      : null
    const db = b.profile?.next_action_at
      ? new Date(b.profile.next_action_at).getTime()
      : null

    if (da !== null && db !== null) return da - db
    if (da !== null) return -1
    if (db !== null) return 1
    // sem data: mais antigo primeiro (mais tempo sem ação)
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

// --------------------------------------------------------------------------
// Segmentação por tipo de cliente
// --------------------------------------------------------------------------

/**
 * Aba de segmento da fila comercial.
 * 'wholesale_buyer' é o foco principal da operação comercial.
 * 'network_partner' é acessível mas secundário (relacionamento mais fixo).
 */
export type SegmentTab = 'wholesale_buyer' | 'network_partner' | 'all'

/**
 * Filtra sessões pelo segmento ativo.
 * 'all' retorna tudo sem filtrar.
 */
export function applySegmentFilter(
  sessions: CrmFilterSession[],
  segment: SegmentTab,
): CrmFilterSession[] {
  if (segment === 'all') return sessions
  return sessions.filter(s => s.profile?.customer_segment === segment)
}

// --------------------------------------------------------------------------
// Views prontas da fila comercial
// --------------------------------------------------------------------------

/**
 * View pronta da fila.
 * `segments`: segmentos nos quais esta view faz sentido exibir.
 *   - undefined = aparece em todos os segmentos
 *   - lista explícita = aparece apenas nesses segmentos
 */
export interface QueueView {
  key: string
  label: string
  segments?: SegmentTab[]
}

export const QUEUE_VIEWS: QueueView[] = [
  { key: 'all', label: 'Todos' },
  { key: 'my_accounts', label: 'Minhas contas' },
  { key: 'followup_vencido', label: 'Vencidos' },
  { key: 'followup_hoje', label: 'Hoje' },
  { key: 'sem_proxima_acao', label: 'Sem próxima ação' },
  // "Novos sem 1º pedido" — relevante principalmente para atacado (conversão inicial)
  { key: 'novo_sem_primeiro_pedido', label: 'Novos s/ pedido', segments: ['wholesale_buyer', 'all'] },
  // "Parceiros inativos" — exclusivo do segmento de rede
  { key: 'parceiro_inativo', label: 'Inativos', segments: ['network_partner', 'all'] },
]

/**
 * Filtra as views disponíveis para o segmento ativo.
 * Se a view ativa não está disponível no novo segmento, retorna 'all'.
 */
export function getViewsForSegment(segment: SegmentTab): QueueView[] {
  return QUEUE_VIEWS.filter(v => !v.segments || v.segments.includes(segment))
}

export function applyQueueView(
  sessions: CrmFilterSession[],
  viewKey: string,
  mySellerId: string,
): CrmFilterSession[] {
  switch (viewKey) {
    case 'my_accounts':
      return sessions.filter(s => mySellerId && s.profile?.seller_id === mySellerId)
    case 'followup_vencido':
      return sessions.filter(isFollowUpVencido)
    case 'followup_hoje':
      return sessions.filter(isFollowUpHoje)
    case 'sem_proxima_acao':
      return sessions.filter(isSemProximaAcao)
    case 'novo_sem_primeiro_pedido':
      return sessions.filter(isNovoSemPrimeiroPedido)
    case 'parceiro_inativo':
      return sessions.filter(isParceiroInativo)
    default:
      return sessions
  }
}

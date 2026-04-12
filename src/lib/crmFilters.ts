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
]

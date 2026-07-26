/**
 * Como o portal se dirige ao parceiro.
 *
 * Era um componente (`PortalPageHeader`) que renderizava título, subtítulo,
 * badge e botões. Virou helper puro porque o shell (`PortalPage`) passou a ser
 * dono do cabeçalho — assim toda página do portal tem a mesma anatomia sem
 * cada uma remontar a sua.
 */

export interface PortalProfile {
  full_name: string | null
  business_type: string | null
  customer_segment: string | null
  is_partner: boolean | null
}

export function getGreeting(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Rótulo comercial exibido no badge de identidade. */
export function resolveCommercialLabel(p: PortalProfile | null | undefined): string {
  if (!p) return 'Parceiro'
  if (p.customer_segment === 'network_partner') return 'Parceiro de rede'
  if (p.is_partner) return 'Parceiro'
  if (p.business_type === 'salao') return 'Salão parceiro'
  if (p.business_type === 'revenda') return 'Revendedor'
  if (p.business_type === 'loja') return 'Loja parceira'
  return 'Parceiro'
}

/** Subtítulo do cabeçalho — fala do negócio do parceiro, não do sistema. */
export function resolveSubtitle(p: PortalProfile | null | undefined): string {
  switch (p?.business_type) {
    case 'salao':   return 'Reabasteça o seu salão'
    case 'revenda': return 'Gerencie o seu estoque de revenda'
    case 'loja':    return 'Gerencie o estoque da sua loja'
    default:        return 'Pedidos, reposição e catálogo B2B'
  }
}

/** Primeiro nome — cabeçalho com nome completo quebra em telas estreitas. */
export function firstName(p: PortalProfile | null | undefined): string {
  const full = p?.full_name?.trim()
  if (!full) return 'Parceiro'
  return full.split(/\s+/)[0]
}

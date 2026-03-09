import { CrmTagCategory, CrmTagCode, CrmRunStatus, CrmAutomationStatus, CrmEventCode } from '../types/crm'

/**
 * Gets a friendly label for tag categories.
 */
export function getTagCategoryLabel(category: CrmTagCategory): string {
  switch (category) {
    case 'behavior': return 'Comportamento'
    case 'financial': return 'Financeiro'
    case 'lifecycle': return 'Jornada/Ciclo de Vida'
    case 'custom': return 'Personalizada'
    default: return 'Geral'
  }
}

/**
 * Maps a tag code to a specific color badge configuration.
 * Adjust Tailwind classes based on the existing theme.
 */
export function getTagColorClasses(code: CrmTagCode | string): string {
  const codeStr = String(code)
  
  // Lifecycle
  if (codeStr === CrmTagCode.NEW_USER) return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (codeStr === CrmTagCode.NO_PURCHASE_7D) return 'bg-yellow-100 text-yellow-700 border-yellow-200'
  if (codeStr === CrmTagCode.NO_PURCHASE_30D || codeStr === CrmTagCode.INACTIVE_30D) return 'bg-orange-100 text-orange-700 border-orange-200'
  if (codeStr === CrmTagCode.INACTIVE_90D || codeStr === CrmTagCode.INACTIVE_180D) return 'bg-red-100 text-red-700 border-red-200'

  // Behavior
  if (codeStr === CrmTagCode.ABANDONED_CART || codeStr === CrmTagCode.ABANDONED_CHECKOUT) return 'bg-rose-100 text-rose-700 border-rose-200'
  
  // Financial
  if (codeStr === CrmTagCode.HIGH_TICKET) return 'bg-purple-100 text-purple-700 border-purple-200'
  if (codeStr === CrmTagCode.RECURRENT) return 'bg-blue-100 text-blue-700 border-blue-200'
  
  // Default fallback for custom or unknown tags
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

/**
 * Label formatter for automation status
 */
export function getAutomationStatusLabel(status: CrmAutomationStatus): string {
  switch (status) {
    case 'active': return 'Ativa'
    case 'paused': return 'Pausada'
    case 'draft': return 'Rascunho'
    default: return status
  }
}

/**
 * Label and color formatter for automation run execution
 */
export function getRunStatusInfo(status: CrmRunStatus): { label: string, color: string } {
  switch (status) {
    case 'success': return { label: 'Sucesso', color: 'text-green-600 bg-green-50 border-green-200' }
    case 'failed': return { label: 'Falha', color: 'text-red-600 bg-red-50 border-red-200' }
    case 'running': return { label: 'Processando', color: 'text-blue-600 bg-blue-50 border-blue-200' }
    case 'pending': return { label: 'Pendente', color: 'text-amber-600 bg-amber-50 border-amber-200' }
    case 'skipped': return { label: 'Ignorado', color: 'text-slate-600 bg-slate-50 border-slate-200' }
    default: return { label: status, color: 'text-slate-600 bg-slate-100' }
  }
}

/**
 * Safely parse metadata JSON 
 */
export function parseRunMetadata(metadata: any): object | null {
  if (!metadata) return null
  if (typeof metadata === 'object') return metadata
  try {
    return JSON.parse(metadata)
  } catch {
    return null
  }
}

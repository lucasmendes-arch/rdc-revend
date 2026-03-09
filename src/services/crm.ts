import { supabase } from '@/lib/supabase'
import { CrmTag, CrmAutomation, CrmAutomationRun, CrmCustomerTag, CrmEventCode } from '../types/crm'

/**
 * Base CRM Service to handle Supabase interactions for Step 1
 * Keeps the read/write logic isolated and reusable.
 */
export const crmService = {

  // ------------------------------------------------------------------
  // Tags
  // ------------------------------------------------------------------

  /**
   * Fetch all available CRM tags
   */
  async getTags(): Promise<CrmTag[]> {
    const { data, error } = await supabase
      .from('crm_tags')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return data as CrmTag[]
  },

  /**
   * Fetch tags applied to a specific user
   */
  async getCustomerTags(userId: string): Promise<CrmCustomerTag[]> {
    const { data, error } = await supabase
      .from('crm_customer_tags')
      .select(`
        id, tag_id, user_id, source, assigned_by, assigned_at,
        tag:crm_tags (*)
      `)
      .eq('user_id', userId)

    if (error) throw error
    
    // Supabase returns tag as an object for one-to-one relation, but TS might infer array without full schema typings.
    // We cast it safely here.
    return data.map(item => ({
      ...item,
      tag: Array.isArray(item.tag) ? item.tag[0] : item.tag
    })) as CrmCustomerTag[]
  },

  /**
   * Adds a tag to a customer manually (Admin action)
   */
  async addCustomerTag(userId: string, tagId: string, source: string = 'manual'): Promise<void> {
    // Optionally fetch the current admin user to set assigned_by
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('crm_customer_tags')
      .insert({
        user_id: userId,
        tag_id: tagId,
        source: source,
        assigned_by: user?.id
      })

    if (error) {
      // If it's a conflict, that's fine, they already have it
      if (error.code === '23505') return // unique violation
      throw error
    }
  },

  /**
   * Removes a tag from a customer manually (Admin action)
   */
  async removeCustomerTag(userId: string, tagId: string): Promise<void> {
    const { error } = await supabase
      .from('crm_customer_tags')
      .delete()
      .match({ user_id: userId, tag_id: tagId })

    if (error) throw error
  },

  // ------------------------------------------------------------------
  // Automations
  // ------------------------------------------------------------------

  /**
   * Fetch all automations with their respective trigger event
   */
  async getAutomations(): Promise<CrmAutomation[]> {
    // Nota: crm_automations não tem FK para crm_events — join removido
    const { data, error } = await supabase
      .from('crm_automations')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as CrmAutomation[]
  },

  /**
   * Ativa ou desativa uma automação (Admin action)
   */
  async toggleAutomation(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('crm_automations')
      .update({ is_active: isActive })
      .eq('id', id)
    if (error) throw error
  },

  /**
   * Dispara manualmente uma automação para um usuário (Admin action).
   * Usa force=true para ignorar is_active — permite teste mesmo com automação inativa.
   */
  async dispatchManual(userId: string, automationId: string): Promise<{ dispatched: number; skipped: number; reason?: string }> {
    const { data, error } = await supabase.functions.invoke('crm-dispatcher', {
      body: { user_id: userId, automation_id: automationId, force: true }
    })
    if (error) throw error
    return data
  },

  /**
   * Fetch run logs (for debug screen primarily)
   */
  async getAutomationRuns(limit: number = 50): Promise<CrmAutomationRun[]> {
    // Nota: coluna era 'triggered_at' (inexistente) → corrigido para 'created_at'
    // crm_automations não tem coluna 'code' → join simplificado para 'name' apenas
    const { data, error } = await supabase
      .from('crm_automation_runs')
      .select(`
        *,
        automation:crm_automations (name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data as CrmAutomationRun[]
  },

  // ------------------------------------------------------------------
  // Events (Tracking)
  // ------------------------------------------------------------------

  /**
   * Universal CRM event tracker.
   * Silently catches errors to avoid breaking the UI.
   * Deduplicates frequent repetitive events like page views locally.
   */
  async trackEvent(payload: {
    user_id?: string | null
    session_id?: string | null
    event_type: CrmEventCode | string
    metadata?: Record<string, any>
  }): Promise<void> {
    try {
      if (!payload.user_id && !payload.session_id) return // need at least one reference

      // deduplication check in memory (e.g. dont send 2 pageviews for same catalog page rapidly)
      // For add to cart, we want to allow it if the cart items count changed, so include it in the key
      const cartCountFragment = payload.metadata?.cart_items_count ? `_cart${payload.metadata.cart_items_count}` : ''
      const dedupKey = `crm_${payload.user_id}_${payload.session_id}_${payload.event_type}_${payload.metadata?.page || ''}${cartCountFragment}`
      const lastSent = localStorage.getItem(dedupKey)
      if (lastSent && Date.now() - Number(lastSent) < 10000) {
        return // skip exact duplicate event within 10 seconds
      }
      localStorage.setItem(dedupKey, String(Date.now()))

      const { error } = await supabase
        .from('crm_events')
        .insert({
          user_id: payload.user_id || undefined, // undefined prevents sending null if restricted in DB
          session_id: payload.session_id || undefined,
          event_type: payload.event_type,
          metadata: payload.metadata || {},
        })

      if (error) {
        console.warn('[CRM] Failed to track event:', payload.event_type, error.message)
      }
    } catch (e) {
      console.warn('[CRM] Exception on trackEvent:', e)
    }
  }
}

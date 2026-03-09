/**
 * CRM Entities & Shared Contracts for Rei dos Cachos B2B
 * Step 1: WhatsApp automations, customer tags, events
 */

// ------------------------------------------------------------------
// 1. WhatsApp-only Channel
// ------------------------------------------------------------------
export type CrmChannel = 'whatsapp'

// ------------------------------------------------------------------
// 2. Tag Categories
// ------------------------------------------------------------------
export type CrmTagCategory = 'behavior' | 'financial' | 'lifecycle' | 'custom'

// ------------------------------------------------------------------
// 3. Tag Codes & Enums
// ------------------------------------------------------------------
export enum CrmTagCode {
  // Lifecycle
  NEW_USER = 'new_user',
  NO_PURCHASE_7D = 'no_purchase_7d',
  NO_PURCHASE_30D = 'no_purchase_30d',
  INACTIVE_30D = 'inactive_30d',
  INACTIVE_90D = 'inactive_90d',
  INACTIVE_180D = 'inactive_180d',

  // Behavior
  ABANDONED_CART = 'abandoned_cart',
  ABANDONED_CHECKOUT = 'abandoned_checkout',
  VIEWED_WITHOUT_CART = 'viewed_without_cart',

  // Financial (Future/Hybrid)
  RECURRENT = 'recurrent',
  HIGH_TICKET = 'high_ticket',
  LOW_TICKET = 'low_ticket',
}

// ------------------------------------------------------------------
// 4. Event Codes (Triggers)
// ------------------------------------------------------------------
export enum CrmEventCode {
  USER_REGISTERED = 'user_registered',
  CART_ABANDONED = 'cart_abandoned',
  CHECKOUT_ABANDONED = 'checkout_abandoned',
  PURCHASE_COMPLETED = 'purchase_completed',
  INACTIVITY_DETECTED = 'inactivity_detected',
  TAG_ADDED = 'tag_added',
}

// ------------------------------------------------------------------
// 5. Automation Codes & Status
// ------------------------------------------------------------------
export type CrmAutomationStatus = 'active' | 'draft' | 'paused'
// Alinhado com o CHECK constraint real do banco (crm_automation_runs.status)
export type CrmRunStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export enum CrmAutomationCode {
  WELCOME_MESSAGE = 'welcome_message',
  ABANDONED_CART_REMINDER = 'abandoned_cart_reminder',
  CHECKOUT_RECOVERY = 'checkout_recovery',
  REACTIVATION_30D = 'reactivation_30d',
  POST_PURCHASE_THANKYOU = 'post_purchase_thankyou',
}

// ------------------------------------------------------------------
// 6. DB Entities (Supabase Tables matching Step 1)
// ------------------------------------------------------------------

/**
 * CrmEventRecord — registro real na tabela crm_events.
 * Colunas reais: id, user_id, session_id, event_type, metadata, created_at.
 */
export interface CrmEventRecord {
  id: string
  user_id: string | null
  session_id: string | null
  event_type: CrmEventCode | string
  metadata: Record<string, unknown>
  created_at: string
}

/**
 * @deprecated Não corresponde à tabela crm_events real.
 * Modela um conceito de "definição de tipo de evento" que não foi implementado no banco.
 * Use CrmEventRecord para interações com a tabela crm_events.
 */
export interface CrmEvent {
  id: string
  code: CrmEventCode | string
  name: string
  description?: string
  is_active: boolean
  created_at: string
}

// Colunas reais da tabela crm_tags
export interface CrmTag {
  id: string
  name: string
  slug: string
  color: string
  type: 'system' | 'custom'
  description: string | null
  created_at: string
}

// Colunas reais da tabela crm_customer_tags
export interface CrmCustomerTag {
  id: string
  user_id: string
  tag_id: string
  source: 'manual' | 'automation' | 'system'
  assigned_by: string | null
  assigned_at: string
  // relationship
  tag?: CrmTag
}

// Colunas reais da tabela crm_automations
export interface CrmAutomation {
  id: string
  name: string
  trigger_type: string
  trigger_conditions: Record<string, unknown>
  action_type: string
  action_config: Record<string, unknown>
  channel: CrmChannel
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CrmAutomationRun {
  id: string
  automation_id: string
  user_id: string | null
  session_id: string | null
  trigger_event: Record<string, unknown>
  action_payload: Record<string, unknown>
  action_response: Record<string, unknown> | null
  status: CrmRunStatus
  error_message: string | null
  attempt_count: number
  idempotency_key: string
  created_at: string
  updated_at: string
}

// ------------------------------------------------------------------
// 7. Webhook Payload Contracts
// ------------------------------------------------------------------
export interface WebhookDeliveryPayload {
  automation_code: string
  user_id: string
  channel: CrmChannel
  customer: {
    name: string
    phone: string
    email: string
  }
  metadata: Record<string, any>
}

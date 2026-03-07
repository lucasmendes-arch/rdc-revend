import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

type FunnelStatus = 'visitou' | 'visualizou_produto' | 'adicionou_carrinho' | 'iniciou_checkout' | 'comprou' | 'abandonou'

function getSessionId(): string {
  let id = localStorage.getItem('rdc_session_id')
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2)}`
    localStorage.setItem('rdc_session_id', id)
  }
  return id
}

// Status hierarchy — only advance forward, never go back (except abandonou which is set by cron)
const statusRank: Record<FunnelStatus, number> = {
  visitou: 1,
  visualizou_produto: 2,
  adicionou_carrinho: 3,
  iniciou_checkout: 4,
  comprou: 5,
  abandonou: 0, // special — set by server only
}

async function upsertSession(data: {
  session_id: string
  status: FunnelStatus
  user_id?: string | null
  email?: string | null
  last_page?: string
  cart_items_count?: number
}) {
  try {
    // Fetch current status to avoid going backwards
    const { data: existing } = await supabase
      .from('client_sessions')
      .select('status')
      .eq('session_id', data.session_id)
      .maybeSingle()

    if (existing) {
      const currentRank = statusRank[existing.status as FunnelStatus] || 0
      const newRank = statusRank[data.status]
      // Don't go backwards (but always allow updates to same status for last_page etc.)
      if (newRank < currentRank) {
        // Still update last_page and cart count, just keep status
        const { error } = await supabase
          .from('client_sessions')
          .update({
            user_id: data.user_id,
            email: data.email,
            last_page: data.last_page,
            cart_items_count: data.cart_items_count,
            updated_at: new Date().toISOString(),
          })
          .eq('session_id', data.session_id)
        if (error) console.warn('Session tracking error:', error.message)
        return
      }
    }

    const { error } = await supabase
      .from('client_sessions')
      .upsert(
        {
          ...data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id' }
      )

    if (error) console.warn('Session tracking error:', error.message)
  } catch {
    // Silently fail — tracking should never break the app
  }
}

export function useTrackPageView(pageName?: string) {
  const { user } = useAuth()

  useEffect(() => {
    const sessionId = getSessionId()

    upsertSession({
      session_id: sessionId,
      status: 'visitou',
      user_id: user?.id || null,
      email: user?.email || null,
      last_page: pageName || window.location.pathname,
    })

    window.fbq?.('track', 'ViewContent', {
      content_name: pageName || window.location.pathname,
      content_type: 'product_group',
    })
  }, [pageName, user])
}

export function useTrackProductView() {
  const { user } = useAuth()

  return useCallback(
    (productName: string) => {
      const sessionId = getSessionId()

      upsertSession({
        session_id: sessionId,
        status: 'visualizou_produto',
        user_id: user?.id || null,
        email: user?.email || null,
        last_page: productName,
      })
    },
    [user]
  )
}

export function useTrackAddToCart() {
  const { user } = useAuth()

  return useCallback(
    (cartItemsCount: number, productName?: string, productPrice?: number) => {
      const sessionId = getSessionId()

      upsertSession({
        session_id: sessionId,
        status: 'adicionou_carrinho',
        user_id: user?.id || null,
        email: user?.email || null,
        cart_items_count: cartItemsCount,
        last_page: window.location.pathname,
      })

      window.fbq?.('track', 'AddToCart', {
        content_name: productName,
        value: productPrice,
        currency: 'BRL',
        num_items: cartItemsCount,
      })
    },
    [user]
  )
}

export function useTrackInitiateCheckout() {
  const { user } = useAuth()

  return useCallback(
    (totalValue: number, numItems: number) => {
      const sessionId = getSessionId()

      upsertSession({
        session_id: sessionId,
        status: 'iniciou_checkout',
        user_id: user?.id || null,
        email: user?.email || null,
        cart_items_count: numItems,
        last_page: '/checkout',
      })

      window.fbq?.('track', 'InitiateCheckout', {
        value: totalValue,
        currency: 'BRL',
        num_items: numItems,
      })
    },
    [user]
  )
}

export function useTrackPurchase() {
  const { user } = useAuth()

  return useCallback(
    (total: number) => {
      const sessionId = getSessionId()

      upsertSession({
        session_id: sessionId,
        status: 'comprou',
        user_id: user?.id || null,
        email: user?.email || null,
        last_page: '/checkout',
      })

      window.fbq?.('track', 'Purchase', {
        value: total,
        currency: 'BRL',
      })
    },
    [user]
  )
}

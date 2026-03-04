import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function getSessionId(): string {
  let id = localStorage.getItem('rdc_session_id')
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2)}`
    localStorage.setItem('rdc_session_id', id)
  }
  return id
}

async function upsertSession(data: {
  session_id: string
  status: 'visitou' | 'escolhendo' | 'comprou'
  user_id?: string | null
  email?: string | null
  last_page?: string
  cart_items_count?: number
}) {
  try {
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
    })
  }, [pageName, user])
}

export function useTrackAddToCart() {
  const { user } = useAuth()

  return useCallback(
    (cartItemsCount: number) => {
      const sessionId = getSessionId()

      upsertSession({
        session_id: sessionId,
        status: 'escolhendo',
        user_id: user?.id || null,
        email: user?.email || null,
        cart_items_count: cartItemsCount,
        last_page: window.location.pathname,
      })

      window.fbq?.('track', 'AddToCart')
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

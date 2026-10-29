'use client'

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

import { api } from '@/lib/client/api'
import { isFinished, type Account, type LookView } from '@/lib/client/types'

// Asks every 3 seconds until each picture is made or has failed, then
// refreshes the credits (a failed picture's credits come back).
export function useLookPolling(results: LookView[], setResults: Dispatch<SetStateAction<LookView[]>>, onAccount: (account: Account) => void) {
  const [pollTick, setPollTick] = useState(0)
  const waitingIds = results.filter(look => !isFinished(look)).map(look => look.id).join(',')
  useEffect(() => {
    if (!waitingIds) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { looks } = await api<{ looks: LookView[] }>(`/api/try-ons?ids=${waitingIds}`)
        if (cancelled) return
        const byId = new Map(looks.map(look => [look.id, look]))
        setResults(current => current.map(look => byId.get(look.id) ?? look))
        if (looks.length && looks.every(isFinished)) {
          const me = await api<{ account: Account }>('/api/me')
          if (!cancelled) onAccount(me.account)
        }
      } catch {
        // Asked again on the next tick.
      } finally {
        if (!cancelled) setPollTick(tick => tick + 1)
      }
    }, 3000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [waitingIds, pollTick, onAccount, setResults])
}

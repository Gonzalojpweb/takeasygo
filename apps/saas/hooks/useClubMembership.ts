'use client'

import { useState, useEffect } from 'react'

export interface ClubMembership {
  isMember: boolean
  name: string
  points: number
  walletEnabled: boolean
  loading: boolean
}

const STORAGE_KEY = (slug: string, locationId?: string | null) =>
  locationId ? `club_${slug}_${locationId}` : `club_${slug}`

function readLocalMembership(tenantSlug: string, locationId?: string | null): { isMember: boolean; name: string; points: number } | null {
  if (typeof window === 'undefined' || !tenantSlug) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY(tenantSlug, locationId))
    if (!raw) return null
    const stored = JSON.parse(raw)
    return { isMember: true, name: stored.name || '', points: stored.points || 0 }
  } catch {
    return null
  }
}

export function useClubMembership(tenantSlug: string, locationId?: string | null): ClubMembership {
  const [state, setState] = useState<ClubMembership>({
    isMember: false, name: '', points: 0, walletEnabled: false, loading: true,
  })

  useEffect(() => {
    if (!tenantSlug) return

    let cancelled = false

    // 1. Read cache first (instant, no flash of wrong data)
    const local = readLocalMembership(tenantSlug, locationId)
    if (local && !cancelled) {
      setState({
        isMember: true,
        name: local.name,
        points: local.points,
        walletEnabled: false,
        loading: false,
      })
    }

    // 2. Try JWT token endpoint first (no NextAuth required)
    const memberToken = typeof window !== 'undefined'
      ? localStorage.getItem(`club_token_${tenantSlug}`)
      : null

    const tryJwtEndpoint = memberToken
      ? fetch(`/api/${tenantSlug}/club-member/me`, {
          headers: { 'x-member-token': memberToken },
        }).then(r => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null)

    // 3. Also try auth-based endpoint (for logged-in users)
    const params = new URLSearchParams()
    if (locationId) params.set('locationId', locationId)

    const tryAuthEndpoint = fetch(`/api/${tenantSlug}/loyalty/me?${params}`)
      .then(r => (r.ok ? r.json() : null)).catch(() => null)

    // Race: use whichever resolves first with member data
    let resolved = false
    Promise.race([
      tryJwtEndpoint.then(data => {
        if (cancelled || resolved || !data?.member) return
        resolved = true
        setState({
          isMember: true,
          name: data.member.name || '',
          points: data.member.points || 0,
          walletEnabled: false,
          loading: false,
        })
        try {
          localStorage.setItem(STORAGE_KEY(tenantSlug, locationId), JSON.stringify({
            name: data.member.name,
            phone: data.member.phone || '',
            points: data.member.points || 0,
            joinedAt: data.member.joinedAt || new Date().toISOString(),
          }))
        } catch { /* ignore */ }
      }),
      tryAuthEndpoint.then(data => {
        if (cancelled || resolved || !data?.member) return
        resolved = true
        setState({
          isMember: true,
          name: data.member.name || '',
          points: data.member.points || 0,
          walletEnabled: data.walletEnabled ?? false,
          loading: false,
        })
        try {
          localStorage.setItem(STORAGE_KEY(tenantSlug, locationId), JSON.stringify({
            name: data.member.name,
            phone: data.member.phone || '',
            points: data.member.points || 0,
            joinedAt: data.member.joinedAt || new Date().toISOString(),
          }))
        } catch { /* ignore */ }
      }),
    ]).then(() => {
      if (cancelled) return
      // If neither endpoint returned a member, mark as not a member
      if (!resolved) {
        setState(prev => ({
          isMember: false, name: '', points: 0, walletEnabled: false, loading: false,
        }))
      }
    }).catch(() => {
      if (cancelled) return
      setState(prev => ({ ...prev, loading: false }))
    })

    return () => { cancelled = true }
  }, [tenantSlug, locationId])

  return state
}

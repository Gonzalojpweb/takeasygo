'use client'

import { useState, useEffect, useCallback } from 'react'

export interface ClubMembership {
  isMember: boolean
  name: string
  points: number
  /** Teléfono del miembro (cache/auth/JWT) — sin formato, tal cual se guardó. */
  phone: string
  walletEnabled: boolean
  loading: boolean
  /** Identifica al miembro en caliente (lookup por celular desde el menú). */
  setMembership: (m: {
    name: string
    phone?: string
    points: number
    joinedAt?: string
  }) => void
}

const STORAGE_KEY = (slug: string, locationId?: string | null) =>
  locationId ? `club_${slug}_${locationId}` : `club_${slug}`

function readLocalMembership(tenantSlug: string, locationId?: string | null): { isMember: boolean; name: string; points: number; phone: string } | null {
  if (typeof window === 'undefined' || !tenantSlug) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY(tenantSlug, locationId))
    if (!raw) return null
    const stored = JSON.parse(raw)
    return { isMember: true, name: stored.name || '', points: stored.points || 0, phone: stored.phone || '' }
  } catch {
    return null
  }
}

export function useClubMembership(tenantSlug: string, locationId?: string | null): ClubMembership {
  const [state, setState] = useState<Omit<ClubMembership, 'setMembership'>>({
    isMember: false, name: '', points: 0, phone: '', walletEnabled: false, loading: true,
  })

  const setMembership = useCallback((m: {
    name: string
    phone?: string
    points: number
    joinedAt?: string
  }) => {
    if (!tenantSlug) return
    try {
      localStorage.setItem(STORAGE_KEY(tenantSlug, locationId), JSON.stringify({
        name: m.name,
        phone: m.phone || '',
        points: m.points || 0,
        joinedAt: m.joinedAt || new Date().toISOString(),
      }))
    } catch { /* storage no disponible: el estado en memoria sigue siendo válido */ }
    setState(prev => ({
      ...prev,
      isMember: true,
      name: m.name,
      points: m.points || 0,
      phone: m.phone || prev.phone,
      loading: false,
    }))
  }, [tenantSlug, locationId])

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
        phone: local.phone,
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
          phone: data.member.phone || '',
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
          phone: data.member.phone || '',
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
      // Si ninguna endpoint devolvió miembro, marcar como no-miembro — sin
      // pisar una identificación inline posterior (lookup por celular en el
      // carrusel del menú) que ya haya seteado el estado.
      if (!resolved) {
        setState(prev => prev.isMember
          ? { ...prev, loading: false }
          : { isMember: false, name: '', points: 0, phone: '', walletEnabled: false, loading: false })
      }
    }).catch(() => {
      if (cancelled) return
      setState(prev => ({ ...prev, loading: false }))
    })

    return () => { cancelled = true }
  }, [tenantSlug, locationId])

  return { ...state, setMembership }
}

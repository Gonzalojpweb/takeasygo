'use client'

import { useEffect, useState } from 'react'

export interface PublicStoreItem {
  _id: string
  name: string
  imageUrl: string
  pointsCost: number
  isFeatured: boolean
}

// Una sola carga por tenant aunque la pidan la Tarjeta del Club y la barra fija.
const cache = new Map<string, Promise<PublicStoreItem[]>>()

function loadItems(tenantSlug: string): Promise<PublicStoreItem[]> {
  let p = cache.get(tenantSlug)
  if (!p) {
    p = fetch(`/api/${tenantSlug}/store/items?isActive=true`)
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then(d => (Array.isArray(d.items) ? d.items : []))
      .catch(() => {
        cache.delete(tenantSlug) // reintenta en el próximo montaje
        return []
      })
    cache.set(tenantSlug, p)
  }
  return p
}

/** Premios activos de la tienda del club (públicos). La tienda es opcional: si falla, lista vacía. */
export function useStoreItems(tenantSlug: string) {
  // Guarda de qué tenant es la lista: si cambia el slug, vuelve a "cargando" sin setState en el efecto.
  const [loaded, setLoaded] = useState<{ slug: string; items: PublicStoreItem[] } | null>(null)

  useEffect(() => {
    let alive = true
    loadItems(tenantSlug).then(items => {
      if (alive) setLoaded({ slug: tenantSlug, items })
    })
    return () => { alive = false }
  }, [tenantSlug])

  const ready = loaded?.slug === tenantSlug
  return { items: ready ? loaded.items : [], loading: !ready }
}

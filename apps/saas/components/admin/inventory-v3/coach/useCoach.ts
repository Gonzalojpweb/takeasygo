'use client'

// ============================================================================
// Guía en vivo — datos (una lectura por sede, se refresca con cada registro)
// ============================================================================
// «Ya lo vi» se guarda en este navegador (por sede y por problema). Si los
// números del problema cambian, la huella cambia y el aviso vuelve a salir.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoachAction, CoachFinding, CoachResult } from '@/lib/inventory/coach/rules'
import type { HelpTopicId } from '@/lib/inventory/ui/help-content'
import { invApi } from '../data/api'
import { useResource } from '../data/useResource'
import type { V3Context } from '../InventoryV3'

const storeKey = (tenant: string, location: string) => `tgo.inv.guide.${tenant}.${location}`

interface GuideMemory {
  /** id → huella del aviso descartado. */
  seen: Record<string, string>
  /** La barra de la guía quedó minimizada. */
  minimized: boolean
}

function readMemory(key: string): GuideMemory {
  try {
    if (typeof window === 'undefined') return { seen: {}, minimized: false }
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const v = JSON.parse(raw) as Partial<GuideMemory>
      return { seen: v.seen ?? {}, minimized: Boolean(v.minimized) }
    }
  } catch {
    /* modo privado o almacenamiento bloqueado: la guía funciona igual */
  }
  return { seen: {}, minimized: false }
}

function writeMemory(key: string, value: GuideMemory) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* sin almacenamiento: no se recuerda, nada más */
  }
}

export function useCoach(ctx: V3Context) {
  const key = storeKey(ctx.tenantSlug, ctx.location.id)
  const res = useResource<CoachResult>(`${ctx.tenantSlug}|coach|${ctx.location.id}|${ctx.location.status}`, (signal) =>
    invApi<CoachResult>(ctx.tenantSlug, `coach?locationId=${ctx.location.id}`, { signal }),
  )
  // Algo se registró: se recarga conservando lo anterior (la guía no parpadea).
  const { reload } = res
  const seenVersion = useRef(ctx.version)
  useEffect(() => {
    if (ctx.version === seenVersion.current) return
    seenVersion.current = ctx.version
    reload()
  }, [ctx.version, reload])
  // El host se remonta por sede (key), así que la memoria se lee una vez al montar.
  // En el servidor no hay localStorage: readMemory devuelve el valor vacío, y la
  // barra recién se dibuja cuando llegan los datos (en el navegador).
  const [memory, setMemory] = useState<GuideMemory>(() => readMemory(key))

  const update = useCallback(
    (fn: (m: GuideMemory) => GuideMemory) =>
      setMemory((m) => {
        const next = fn(m)
        writeMemory(key, next)
        return next
      }),
    [key],
  )

  const isSeen = useCallback((f: CoachFinding) => memory.seen[f.id] === f.fingerprint, [memory.seen])
  const dismiss = useCallback((f: CoachFinding) => update((m) => ({ ...m, seen: { ...m.seen, [f.id]: f.fingerprint } })), [update])
  const restoreAll = useCallback(() => update((m) => ({ ...m, seen: {} })), [update])
  const setMinimized = useCallback((minimized: boolean) => update((m) => ({ ...m, minimized })), [update])

  const visible = useMemo(() => (res.data?.findings ?? []).filter((f) => !isSeen(f)), [res.data, isSeen])
  const hiddenCount = (res.data?.findings.length ?? 0) - visible.length
  const alerts = visible.filter((f) => f.level === 'stop' || f.level === 'warn').length

  return { ...res, visible, hiddenCount, alerts, isSeen, dismiss, restoreAll, minimized: memory.minimized, setMinimized }
}

export type CoachState = ReturnType<typeof useCoach>

/** Ejecuta la acción de la guía: abre el panel o la vista correspondiente. */
export function runCoachAction(ctx: V3Context, action: CoachAction, close?: () => void) {
  close?.()
  switch (action.type) {
    case 'recipe':
      ctx.open({ type: 'recipe', menuItemId: action.menuItemId, variantName: action.variantName })
      break
    case 'count':
      ctx.open({ type: 'count', skuId: action.skuId, storageLocationId: null })
      break
    case 'receive':
      ctx.open(action.skuId ? { type: 'receive', skuId: action.skuId } : { type: 'receive' })
      break
    case 'sku':
      ctx.open({ type: 'product', skuId: action.skuId })
      break
    case 'view':
      ctx.goTo(action.view)
      break
    case 'setup':
      ctx.goTo('ahora')
      break
    case 'help':
      ctx.help(action.topic as HelpTopicId)
      break
  }
}

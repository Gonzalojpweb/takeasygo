'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoardItem, OrderAlertItem, ScheduledAlertConfig } from './types'

interface UseScheduledDueDetectorOptions<T extends BoardItem> {
  items: T[]
  enabled: boolean
  config?: ScheduledAlertConfig<T>
  /** Estados del item para los cuales la alerta sigue siendo relevante. */
  actionableStatuses?: string[]
  /** Callback al atender: recibe el item para seleccionarlo en el board. */
  onAttend?: (item: T) => void
}

const MAX_TIMER_DELAY_MS = 24 * 60 * 60_000

/**
 * useScheduledDueDetector — arma la cola del popup de atención para:
 * 1. Items NUEVOS que entran al board (cualquier tipo: transferencia, MP,
 *    efectivo, inmediato o programado) — siempre que estén en actionableStatuses.
 * 2. Items programados que alcanzan el T-lead (printNotBefore).
 *
 * Mecanismo:
 * - El poll de useBoardAutoRefresh (30s visible / 60s oculto) es la fuente de
 *   verdad: cada ciclo de items re-evalúa ambos eventos.
 * - setTimeout solo es optimización para disparar en el instante exacto del
 *   T-lead (el peor caso sin él es 1 ciclo de poll, ≤60s).
 * - firedIdsRef guarda claves compuestas `new:${id}` / `tlead:${id}` y
 *   garantiza exactly-once POR EVENTO: aunque el poll traiga el mismo item
 *   una y otra vez, jamás se re-dispara (sin popup-storm); un mismo pedido
 *   puede disparar como nuevo y, más tarde, en su T-lead.
 * - La cola deduplica por alert.id: si ambos eventos caen en el mismo ciclo,
 *   gana el T-lead (se evalúa primero) y no hay doble popup.
 * - Los items visibles en el primer ciclo se registran como conocidos
 *   (knownIdsRef): abrir el board con pedidos existentes no dispara nada.
 */
export function useScheduledDueDetector<T extends BoardItem>({
  items,
  enabled,
  config,
  actionableStatuses,
  onAttend,
}: UseScheduledDueDetectorOptions<T>) {
  const [queue, setQueue] = useState<OrderAlertItem[]>([])
  const firedIdsRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const knownIdsRef = useRef<Set<string> | null>(null)
  const itemsRef = useRef(items)
  const configRef = useRef(config)
  const actionableRef = useRef(actionableStatuses)

  // Sincroniza refs tras el commit (nunca durante render) — los timers y
  // callbacks posteriores leen siempre el valor más fresco.
  useEffect(() => {
    itemsRef.current = items
    configRef.current = config
    actionableRef.current = actionableStatuses
  })

  const isActionable = useCallback((item: T) => {
    const statuses = actionableRef.current
    if (!statuses || statuses.length === 0) return true
    return statuses.includes(item.status)
  }, [])

  const getItemDueInfo = useCallback((item: T): { dueAt: number; alert: OrderAlertItem } | null => {
    const cfg = configRef.current
    if (!cfg) return null
    const iso = cfg.getPrintNotBefore(item)
    if (!iso) return null
    const dueAt = new Date(iso).getTime()
    if (Number.isNaN(dueAt)) return null
    return { dueAt, alert: cfg.buildAlert(item) }
  }, [])

  const enqueue = useCallback((alert: OrderAlertItem, firedKey: string) => {
    if (firedIdsRef.current.has(firedKey)) return
    firedIdsRef.current.add(firedKey)
    // La cola deduplica por item: si el mismo pedido ya está pendiente, no se apila
    setQueue(prev => (prev.some(a => a.id === alert.id) ? prev : [...prev, alert]))
  }, [])

  // Evalúa items vencidos + items nuevos ahora, y programa timers futuros
  useEffect(() => {
    if (!enabled || !config) return

    // Primer ciclo (o reactivación): todo lo visible es "conocido" — sin popup masivo
    let knownIds = knownIdsRef.current
    if (knownIds === null) {
      knownIds = new Set(items.map(i => i._id))
      knownIdsRef.current = knownIds
    }

    const now = Date.now()
    const liveTimerIds = new Set<string>()
    const pendingAlerts: { alert: OrderAlertItem; key: string }[] = []

    for (const item of items) {
      const info = getItemDueInfo(item)

      if (info && info.dueAt <= now) {
        // T-lead vencido: se encola vía callback (dedup exactly-once en enqueue).
        // Se evalúa antes que "nuevo" para que el contenido urgente gane si coinciden.
        if (isActionable(item)) pendingAlerts.push({ alert: info.alert, key: `tlead:${item._id}` })
      } else if (info) {
        // Futuro: timer de optimización para disparo exacto (si no hay ya uno
        // para este item con el mismo vencimiento). >24h no se timeriza: el
        // poll lo detectará igual (peor caso 1 ciclo).
        const delay = info.dueAt - now
        if (delay <= MAX_TIMER_DELAY_MS) {
          liveTimerIds.add(item._id)

          if (!timersRef.current.has(item._id)) {
            const timer = setTimeout(() => {
              timersRef.current.delete(item._id)
              const latest = itemsRef.current.find(i => i._id === item._id)
              if (!latest || !isActionable(latest)) return
              const fresh = getItemDueInfo(latest)
              if (fresh && fresh.dueAt <= Date.now()) enqueue(fresh.alert, `tlead:${item._id}`)
            }, delay + 250)
            timersRef.current.set(item._id, timer)
          }
        }
      }

      // Item nuevo en el board (cualquier tipo de pedido) — popup de llegada
      if (!knownIds.has(item._id) && isActionable(item)) {
        const buildNew = config.buildNewAlert ?? config.buildAlert
        pendingAlerts.push({ alert: buildNew(item), key: `new:${item._id}` })
      }
    }

    knownIdsRef.current = new Set(items.map(i => i._id))

    // Limpia timers de items que ya no existen o salieron del board
    for (const [id, timer] of timersRef.current) {
      if (!liveTimerIds.has(id)) {
        clearTimeout(timer)
        timersRef.current.delete(id)
      }
    }

    // setState diferido a microtask (regla react-hooks/set-state-in-effect)
    if (pendingAlerts.length > 0) {
      queueMicrotask(() => pendingAlerts.forEach(({ alert, key }) => enqueue(alert, key)))
    }
  }, [items, enabled, config, enqueue, getItemDueInfo, isActionable])

  // Al desactivar: cola vacía + timers liberados + knownIds reiniciado (si se
  // reactiva, lo que entró mientras estuvo off no dispara en masa; firedIds se
  // conserva para no re-disparar en la misma sesión)
  useEffect(() => {
    if (enabled) return
    knownIdsRef.current = null
    // setState diferido a microtask (regla react-hooks/set-state-in-effect)
    queueMicrotask(() => setQueue([]))
    for (const timer of timersRef.current.values()) clearTimeout(timer)
    timersRef.current.clear()
  }, [enabled])

  // Cleanup al desmontar
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const attend = useCallback((alert: OrderAlertItem) => {
    const item = itemsRef.current.find(i => i._id === alert.id)
    setQueue(prev => prev.filter(a => a.id !== alert.id))
    if (item) onAttend?.(item)
  }, [onAttend])

  const dismiss = useCallback((alert: OrderAlertItem) => {
    // firedIdsRef conserva el id → no se re-dispara nunca
    setQueue(prev => prev.filter(a => a.id !== alert.id))
  }, [])

  return { queue, attend, dismiss }
}

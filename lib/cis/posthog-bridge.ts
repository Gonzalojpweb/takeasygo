// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/posthog-bridge.ts — Conexión real PostHog ↔ CIS
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Consultar eventos reales de PostHog por customer (phoneHash)
// para reemplazar los valores proxy de engagement metrics.
//
// Diseño:
// - Usa el mismo patrón de lib/tia/posthog.ts (raw fetch, no SDK server)
// - Consulta por rango de fechas con property filter: phoneHash
// - Devuelve métricas de engagement reales por customer
// - Graceful degradation: si PostHog no tiene datos, devuelve defaults
//
// Eventos de PostHog que nos interesan:
// - menu.opened     → menuViews
// - dish.viewed     → productViews
// - dish.added      → cartAdds
// - checkout.started → checkoutStarts
// - order.completed → completedOrders (ya tenemos este de Order model)
// ─────────────────────────────────────────────────────────────────────────────

const POSTHOG_HOST = 'https://us.i.posthog.com'

interface PostHogEngagementData {
  menuViews: number
  productViews: number
  cartAdds: number
  checkoutStarts: number
  completedOrders: number
}

function getPostHogConfig() {
  const key = process.env.POSTHOG_SERVER_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID
  if (!key || !projectId) return null
  return { key, projectId }
}

// ── Consulta Trends de PostHog con property filter ───────────────────────────

async function queryPostHogTrendWithPhoneHash(
  event: string,
  phoneHash: string,
  tenantId: string,
  days = 90
): Promise<number> {
  const config = getPostHogConfig()
  if (!config) return 0

  try {
    const res = await fetch(`${POSTHOG_HOST}/api/projects/${config.projectId}/query/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        query: {
          kind: 'TrendsQuery',
          dateRange: { date_from: `-${days}d` },
          series: [{ kind: 'EventsNode', event, name: event }],
          interval: 'day',
          properties: [
            { key: 'tenantId', value: [tenantId], operator: 'exact', type: 'event' },
            { key: 'phoneHash', value: [phoneHash], operator: 'exact', type: 'person' },
          ],
        },
      }),
    })

    if (!res.ok) return 0

    const data = await res.json()
    if (!data?.results?.length) return 0

    // Sumar todos los días del trend
    const dailyValues = data.results[0].data as number[]
    return dailyValues.reduce((sum, v) => sum + (v ?? 0), 0)
  } catch {
    return 0
  }
}

// ── Consulta Trends agrupada por phoneHash (para batch) ──────────────────────

async function queryPostHogTrendBatch(
  event: string,
  phoneHashes: string[],
  tenantId: string,
  days = 90
): Promise<Map<string, number>> {
  const config = getPostHogConfig()
  const results = new Map<string, number>()

  if (!config || phoneHashes.length === 0) return results

  // PostHog Trends con breakdown por phoneHash
  // Limitamos a 50 customers por batch para evitar rate limits
  const BATCH_SIZE = 50
  for (let i = 0; i < phoneHashes.length; i += BATCH_SIZE) {
    const batch = phoneHashes.slice(i, i + BATCH_SIZE)

    try {
      const res = await fetch(`${POSTHOG_HOST}/api/projects/${config.projectId}/query/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.key}`,
        },
        body: JSON.stringify({
          query: {
            kind: 'TrendsQuery',
            dateRange: { date_from: `-${days}d` },
            series: [{ kind: 'EventsNode', event, name: event }],
            interval: 'day',
            properties: [
              { key: 'tenantId', value: [tenantId], operator: 'exact', type: 'event' },
            ],
            breakdown: { breakdown_type: 'person', breakdown: 'phoneHash' },
          },
        }),
      })

      if (!res.ok) continue

      const data = await res.json()
      if (!data?.results?.length) continue

      // PostHog devuelve un array de results, cada uno con breakdown_value
      for (const result of data.results) {
        const phoneHash = result.breakdown_value as string
        if (!phoneHash || !batch.includes(phoneHash)) continue
        const total = (result.data as number[]).reduce((sum, v) => sum + (v ?? 0), 0)
        results.set(phoneHash, total)
      }
    } catch {
      // Silent fail — continue with next batch
    }
  }

  return results
}

// ── Obtener engagement real de un customer ───────────────────────────────────

export async function fetchCustomerEngagement(
  phoneHash: string,
  tenantId: string,
  days = 90
): Promise<PostHogEngagementData> {
  const tenantIdStr = tenantId.toString()

  // Consultar eventos en paralelo
  const [menuViews, productViews, cartAdds, checkoutStarts] = await Promise.all([
    queryPostHogTrendWithPhoneHash('menu.opened', phoneHash, tenantIdStr, days),
    queryPostHogTrendWithPhoneHash('dish.viewed', phoneHash, tenantIdStr, days),
    queryPostHogTrendWithPhoneHash('dish.added', phoneHash, tenantIdStr, days),
    queryPostHogTrendWithPhoneHash('checkout.started', phoneHash, tenantIdStr, days),
  ])

  return {
    menuViews,
    productViews,
    cartAdds,
    checkoutStarts,
    completedOrders: 0, // Se llena desde Consumer.totalOrders (ya tenemos esos datos)
  }
}

// ── Obtener engagement de batch de customers ─────────────────────────────────

export async function fetchBatchEngagement(
  phoneHashes: string[],
  tenantId: string,
  days = 90
): Promise<Map<string, PostHogEngagementData>> {
  const engagementMap = new Map<string, PostHogEngagementData>()
  const tenantIdStr = tenantId.toString()

  if (phoneHashes.length === 0) return engagementMap

  // Consultar todos los eventos en paralelo
  const [menuViews, productViews, cartAdds, checkoutStarts] = await Promise.all([
    queryPostHogTrendBatch('menu.opened', phoneHashes, tenantIdStr, days),
    queryPostHogTrendBatch('dish.viewed', phoneHashes, tenantIdStr, days),
    queryPostHogTrendBatch('dish.added', phoneHashes, tenantIdStr, days),
    queryPostHogTrendBatch('checkout.started', phoneHashes, tenantIdStr, days),
  ])

  // Combinar resultados por phoneHash
  for (const phoneHash of phoneHashes) {
    engagementMap.set(phoneHash, {
      menuViews: menuViews.get(phoneHash) ?? 0,
      productViews: productViews.get(phoneHash) ?? 0,
      cartAdds: cartAdds.get(phoneHash) ?? 0,
      checkoutStarts: checkoutStarts.get(phoneHash) ?? 0,
      completedOrders: 0, // Se llena después desde Consumer
    })
  }

  return engagementMap
}

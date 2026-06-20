const POSTHOG_HOST = 'https://us.i.posthog.com'

function getPostHogConfig() {
  const key = process.env.POSTHOG_SERVER_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID
  if (!key || !projectId) return null
  return { key, projectId }
}

function addTenantFilter(query: any, tenantId: string): any {
  if (!tenantId) return query
  const tenantFilter = { key: 'tenantId', value: [tenantId], operator: 'exact', type: 'event' as const }
  return {
    ...query,
    properties: [
      ...(query.properties || []),
      tenantFilter,
    ],
  }
}

export async function queryPostHog(query: any, tenantId?: string): Promise<any> {
  const config = getPostHogConfig()
  if (!config) return null

  const queryWithFilter = tenantId ? addTenantFilter(query, tenantId) : query

  try {
    const auth = Buffer.from(`${config.key}:`).toString('base64')
    const res = await fetch(`${POSTHOG_HOST}/api/projects/${config.projectId}/query/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ query: queryWithFilter }),
    })
    if (!res.ok) {
      console.warn('[PostHog Query]', res.status, await res.text())
      return null
    }
    return res.json()
  } catch (err) {
    console.warn('[PostHog Query] fetch failed', err)
    return null
  }
}

export async function fetchPostHogTrend(event: string, days = 30, tenantId?: string): Promise<{ label: string; value: number }[]> {
  const result = await queryPostHog({
    kind: 'TrendsQuery',
    dateRange: { date_from: `-${days}d` },
    series: [{ kind: 'events', event, name: event }],
    interval: 'day',
    breakdown: undefined,
  }, tenantId)
  if (!result?.results?.length) return []
  const rawLabels = result.results[0].labels as string[]
  const rawData = result.results[0].data as number[]
  return rawLabels.map((label, i) => ({ label, value: rawData[i] ?? 0 }))
}

export async function fetchPostHogTotal(event: string, days = 30, tenantId?: string): Promise<number> {
  const trend = await fetchPostHogTrend(event, days, tenantId)
  return trend.reduce((sum, d) => sum + d.value, 0)
}

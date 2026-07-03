const SYNC_URL = "http://localhost:3001"

const HEALTH_ENDPOINT = `${SYNC_URL}/api/v1/health`
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000
const BACKOFF_MULTIPLIER = 2

type ReconnectCallback = () => void

let isOnline = typeof navigator !== "undefined" ? navigator.onLine : true
let healthCheckInterval: ReturnType<typeof setInterval> | null = null
let reconnectListeners: ReconnectCallback[] = []
let backoffMs = INITIAL_BACKOFF_MS

function setOnline(value: boolean) {
  isOnline = value
}

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_ENDPOINT, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function handleReconnect() {
  const healthy = await checkHealth()

  if (healthy) {
    setOnline(true)
    backoffMs = INITIAL_BACKOFF_MS
    for (const cb of reconnectListeners) {
      cb()
    }
  } else {
    setOnline(false)
    backoffMs = Math.min(backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS)
    scheduleRetry()
  }
}

function scheduleRetry() {
  setTimeout(() => {
    if (isOnline) return
    handleReconnect()
  }, backoffMs)
}

function onBrowserOnline() {
  handleReconnect()
}

function onBrowserOffline() {
  setOnline(false)
}

export function startConnectivityMonitoring() {
  if (healthCheckInterval) return

  window.addEventListener("online", onBrowserOnline)
  window.addEventListener("offline", onBrowserOffline)

  setOnline(navigator.onLine)

  healthCheckInterval = setInterval(async () => {
    const wasOnline = isOnline
    const healthy = await checkHealth()

    if (healthy && !wasOnline) {
      handleReconnect()
    } else if (!healthy && wasOnline) {
      setOnline(false)
      scheduleRetry()
    }
  }, 30000)
}

export function stopConnectivityMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
    healthCheckInterval = null
  }
  window.removeEventListener("online", onBrowserOnline)
  window.removeEventListener("offline", onBrowserOffline)
}

export function getIsOnline(): boolean {
  return isOnline
}

export function onReconnect(callback: ReconnectCallback): () => void {
  reconnectListeners.push(callback)
  return () => {
    reconnectListeners = reconnectListeners.filter((cb) => cb !== callback)
  }
}

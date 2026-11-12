import { useSyncExternalStore } from "react"
import { getOfflineStatus, subscribeOfflineStatus, type OfflineStatus } from "../services/offline/status"

/** Estado del modo sin internet (conexión, cola, habilitación) para la UI. */
export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus, getOfflineStatus)
}

import { type ReactNode } from 'react'

// ─── Base Item ──────────────────────────────────────────────
// Any item displayed in the board must extend this interface.
// Consumers add domain-specific fields via extension.
export interface BoardItem {
  _id: string
  status: string
  createdAt: string
}

// ─── Column Definition ──────────────────────────────────────
// Defines a single column in the board.
export interface BoardColumnDef {
  /** Status string that matches item.status (used when `statuses` is not set) */
  status: string
  /** Multiple statuses that map to this column (e.g. awaiting_payment + awaiting_confirmation → Transferencias) */
  statuses?: string[]
  /** Display label for the column header */
  title: string
  /** Tailwind class for the dot indicator, e.g. 'bg-amber-400' */
  dotColor: string
  /** Tailwind classes for the count badge, e.g. 'bg-amber-100 text-amber-700' */
  color: string
}

// ─── Search Config ──────────────────────────────────────────
export interface BoardSearchConfig<T extends BoardItem> {
  /** Function to extract searchable text from an item */
  getSearchFields: (item: T) => string[]
}

// ─── Location Config ────────────────────────────────────────
export interface BoardLocationConfig {
  /** Field name on item that holds the location ID. Default: 'locationId' */
  locationIdField?: string
  /** Available locations */
  locations: { _id: string; name: string; colorIndex?: number }[]
  /** User's assigned location IDs (empty = admin, sees all) */
  userAssignedLocations?: string[]
}

// ─── Render Props ───────────────────────────────────────────
/** Alerta de popup de atención (pedido nuevo o programado en T-lead). */
export interface OrderAlertItem {
  id: string
  title: string
  description?: string
  /** Título del header del popup. Default: '¡Es hora de prepararlo!'. */
  headline?: string
  /** Subtítulo del header del popup. Default: 'Pedido programado alcanzó el tiempo de impresión'. */
  subline?: string
}

/** Config del detector de popup: pedidos nuevos + programados que alcanzan el T-lead. */
export interface ScheduledAlertConfig<T extends BoardItem> {
  /** Momento ISO en que el item alcanza el T-lead (printNotBefore). null = no programado. */
  getPrintNotBefore: (item: T) => string | null | undefined
  /** Contenido del popup para un item vencido (T-lead de impresión). */
  buildAlert: (item: T) => OrderAlertItem
  /** Contenido del popup cuando entra un item NUEVO al board (cualquier tipo). Default: buildAlert. */
  buildNewAlert?: (item: T) => OrderAlertItem
}
export interface BoardCardRenderProps<T extends BoardItem> {
  item: T
  isSelected: boolean
  isNew: boolean
  isEscalated: boolean
  onClick: () => void
}

export interface BoardContextPanelRenderProps<T extends BoardItem> {
  item: T
  tenantSlug: string
  onClose: () => void
  onRefresh: () => void
}

export interface BoardInsightsRenderProps<T extends BoardItem> {
  items: T[]
}

// ─── Main Board Props ──────────────────────────────────────
export interface OperationsBoardProps<T extends BoardItem> {
  /** Array of items to display in the board */
  items: T[]
  /** Column definitions */
  columns: BoardColumnDef[]
  /** Tenant slug for API calls */
  tenantSlug: string
  /** Statuses that count as "active" (affects refresh speed and count) */
  activeStatuses: string[]
  /** Statuses that trigger sound/toast alerts on new items. Default: activeStatuses */
  alertStatuses?: string[]
  /** Search configuration */
  searchConfig?: BoardSearchConfig<T>
  /** Location filtering configuration */
  locationConfig?: BoardLocationConfig
  /** Controlled active location (from context). When provided, overrides internal state. */
  controlledActiveLocation?: string
  /** Callback when the active location filter changes. Receives the location _id or 'all'. */
  onLocationChange?: (locationId: string) => void
  /** Render function for each card in a column */
  renderCard: (props: BoardCardRenderProps<T>) => ReactNode
  /** Render function for the right-side context panel */
  renderContextPanel: (props: BoardContextPanelRenderProps<T>) => ReactNode
  /** Render function for the insights/summary panel (shown when nothing selected) */
  renderInsights?: (props: BoardInsightsRenderProps<T>) => ReactNode
  /** Optional extra actions to render in the toolbar */
  toolbarActions?: ReactNode
  /** Callback when user clicks "cleanup" button. If not provided, button is hidden. */
  onCleanup?: () => void | Promise<void>
  /** Custom toast content for new items. onAttend selects the first item in the board. */
  getNewItemToast?: (items: T[], onAttend: () => void) => { title: string; description: string }
  /** Sound file path for new item alerts. Default: no sound. */
  soundSrc?: string
  /** Auto-select an item by _id on mount (e.g. from notification action button). */
  autoSelectId?: string | null
  /** Habilita el popup centrado de atención: cualquier pedido nuevo + programados en T-lead. */
  enableAttentionPopup?: boolean
  /** Config del detector del popup (requiere enableAttentionPopup). */
  scheduledAlertConfig?: ScheduledAlertConfig<T>
}

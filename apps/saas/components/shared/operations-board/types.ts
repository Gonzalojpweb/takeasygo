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
  /** Status string that matches item.status */
  status: string
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
}

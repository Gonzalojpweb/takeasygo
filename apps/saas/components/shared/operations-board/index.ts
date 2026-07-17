// ─── Generic Board Components ──────────────────────────────
export { default as OperationsBoard } from './OperationsBoard'
export { default as BoardColumn } from './BoardColumn'
export { default as BoardToolbar } from './BoardToolbar'
export { default as BoardContextPanelShell } from './BoardContextPanelShell'
export { default as BoardInsightsShell } from './BoardInsightsShell'
export { default as BoardSkeleton } from './BoardSkeleton'
export { default as BoardEmptyState } from './BoardEmptyState'

// ─── Hooks ─────────────────────────────────────────────────
export { useBoardAutoRefresh } from './useBoardAutoRefresh'
export { useBoardNewItemDetector } from './useBoardNewItemDetector'
export { useWorkspaceZoom } from './useWorkspaceZoom'

// ─── Types ─────────────────────────────────────────────────
export type {
  BoardItem,
  BoardColumnDef,
  BoardSearchConfig,
  BoardLocationConfig,
  BoardCardRenderProps,
  BoardContextPanelRenderProps,
  BoardInsightsRenderProps,
  OperationsBoardProps,
} from './types'

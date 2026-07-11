import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface ContextPanelContent {
  title: string
  subtitle?: string
  body: ReactNode
  footer?: ReactNode
}

interface ActionBarContent {
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}

interface LayoutContextValue {
  contextPanel: ContextPanelContent | null
  actionBar: ActionBarContent | null
  setContextPanel: (content: ContextPanelContent | null) => void
  setActionBar: (content: ActionBarContent | null) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

const LayoutContext = createContext<LayoutContextValue>({
  contextPanel: null,
  actionBar: null,
  setContextPanel: () => {},
  setActionBar: () => {},
  sidebarCollapsed: false,
  toggleSidebar: () => {},
})

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [contextPanel, setContextPanelState] = useState<ContextPanelContent | null>(null)
  const [actionBar, setActionBarState] = useState<ActionBarContent | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const setContextPanel = useCallback((content: ContextPanelContent | null) => {
    setContextPanelState(content)
  }, [])

  const setActionBar = useCallback((content: ActionBarContent | null) => {
    setActionBarState(content)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  return (
    <LayoutContext.Provider value={{ contextPanel, actionBar, setContextPanel, setActionBar, sidebarCollapsed, toggleSidebar }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  return useContext(LayoutContext)
}

export type { ContextPanelContent, ActionBarContent }

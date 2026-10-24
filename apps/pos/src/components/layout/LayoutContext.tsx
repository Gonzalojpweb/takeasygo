import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react"

interface ContextPanelContent {
  title: string
  subtitle?: string
  body: ReactNode
  footer?: ReactNode
  /**
   * Celular: el Context Panel es una hoja inferior que muestra siempre su
   * encabezado (la entidad nunca desaparece — Scene Architecture DD-004) y se
   * despliega al tocarlo. `true` la abre al entrar a la escena (p. ej. al
   * elegir una mesa). En desktop no tiene efecto.
   */
  openOnMobile?: boolean
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
  /** Hoja del Context Panel desplegada (solo celular). */
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  /**
   * Centro del Header (Fase A, 2026-10): las vistas del contexto (Salón,
   * Mostrador…) viven ACÁ y no en un renglón propio del workspace: una sola
   * franja arriba, más alto para trabajar. null = el título del contexto.
   */
  headerCenter: ReactNode | null
  setHeaderCenter: (content: ReactNode | null) => void
}

const LayoutContext = createContext<LayoutContextValue>({
  contextPanel: null,
  actionBar: null,
  setContextPanel: () => {},
  setActionBar: () => {},
  sidebarCollapsed: false,
  toggleSidebar: () => {},
  panelOpen: false,
  setPanelOpen: () => {},
  headerCenter: null,
  setHeaderCenter: () => {},
})

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [contextPanel, setContextPanelState] = useState<ContextPanelContent | null>(null)
  const [actionBar, setActionBarState] = useState<ActionBarContent | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [headerCenter, setHeaderCenter] = useState<ReactNode | null>(null)

  const panelTitleRef = useRef<string | null>(null)

  const setContextPanel = useCallback((content: ContextPanelContent | null) => {
    // Otra entidad / escena ⇒ la hoja vuelve a su estado por defecto. El
    // mismo título (re-render con datos frescos) no la cierra.
    const title = content?.title ?? null
    if (title !== panelTitleRef.current) {
      panelTitleRef.current = title
      setPanelOpen(Boolean(content?.openOnMobile))
    }
    setContextPanelState(content)
  }, [])

  const setActionBar = useCallback((content: ActionBarContent | null) => {
    setActionBarState(content)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  return (
    <LayoutContext.Provider
      value={{ contextPanel, actionBar, setContextPanel, setActionBar, sidebarCollapsed, toggleSidebar, panelOpen, setPanelOpen, headerCenter, setHeaderCenter }}
    >
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  return useContext(LayoutContext)
}

export type { ContextPanelContent, ActionBarContent }

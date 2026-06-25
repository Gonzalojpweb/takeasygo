'use client'

import { useState, useMemo } from 'react'
import { BookOpen, Search, ChevronRight, FileText, Menu, X } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'

interface DocFile {
  name: string
  label: string
  description: string
}

interface DeveloperClientProps {
  files: DocFile[]
  initialDoc: string
  initialContent: string
}

const DOC_INFO: Record<string, { label: string; description: string }> = {
  'MASTER.md': { label: 'MASTER', description: 'Índice central de toda la documentación' },
  '01-FUNDAMENTOS.md': { label: '01 — Fundamentos', description: 'Visión, tech stack, arquitectura, principios de diseño' },
  '02-MODELOS.md': { label: '02 — Modelos', description: 'Los 34 modelos MongoDB, schemas, índices, relaciones' },
  '03-AUTH-SEGURIDAD.md': { label: '03 — Auth & Seguridad', description: 'NextAuth, RBAC, API keys, rate limiting, CORS, CSP' },
  '04-API-REFERENCE.md': { label: '04 — API Reference', description: '~120 endpoints con request/response, auth, validación' },
  '05-INTEGRACIONES-PAGO.md': { label: '05 — Pagos', description: 'MercadoPago, Kripton, Google Wallet, Apple Wallet' },
  '06-MODULOS-NEGOCIO.md': { label: '06 — Módulos de Negocio', description: 'Orders, menú, loyalty, delivery, reservas, promociones' },
  '07-TIA.md': { label: '07 — TIA', description: 'TakeasyGO Intelligence Agent, SIL, benchmarking' },
  '08-FRONTEND.md': { label: '08 — Frontend', description: 'Pages, componentes, contexts, hooks, providers' },
  '09-DEVOPS.md': { label: '09 — DevOps', description: 'Vercel, env vars, cron jobs, printer agent, monitoreo' },
  '10-ADRS.md': { label: '10 — ADRs', description: 'Decision records con contexto, opciones, rationale' },
}

export default function DeveloperClient({ files, initialDoc, initialContent }: DeveloperClientProps) {
  const [selectedDoc, setSelectedDoc] = useState(initialDoc)
  const [content, setContent] = useState(initialContent)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const docFiles = useMemo(() => {
    return files
      .filter(f => f.name.endsWith('.md'))
      .map(f => ({
        ...f,
        ...DOC_INFO[f.name],
        label: DOC_INFO[f.name]?.label || f.name.replace('.md', ''),
        description: DOC_INFO[f.name]?.description || '',
      }))
      .sort((a, b) => {
        if (a.name === 'MASTER.md') return -1
        if (b.name === 'MASTER.md') return 1
        return a.name.localeCompare(b.name)
      })
  }, [files])

  const handleSelectDoc = async (name: string) => {
    if (name === selectedDoc && content) return
    setLoading(true)
    try {
      const res = await fetch(`/api/superadmin/developer/doc?file=${encodeURIComponent(name)}`)
      const data = await res.json()
      if (data.content) {
        setContent(data.content)
        setSelectedDoc(name)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (err) {
      console.error('Error loading doc:', err)
    } finally {
      setLoading(false)
      setSidebarOpen(false)
    }
  }

  const currentDoc = docFiles.find(f => f.name === selectedDoc)

  return (
    <div className="flex h-[calc(100vh-10rem)] lg:h-[calc(100vh-8rem)] -mx-4 md:-mx-8 lg:-mx-10 -mt-4 md:-mt-8 lg:-mt-10 gap-0 relative">
      {/* Sidebar */}
      <>
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`
            fixed lg:sticky top-0 left-0 z-50 lg:z-0
            w-72 h-full
            bg-sidebar text-sidebar-foreground
            border-r border-sidebar-border/30
            transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            flex flex-col
          `}
        >
          <div className="p-4 border-b border-sidebar-border/30">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <BookOpen size={16} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Developer</h2>
                <p className="text-sidebar-foreground/40 text-[10px] font-medium">Documentación Técnica</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {docFiles.map((file) => (
              <button
                key={file.name}
                onClick={() => handleSelectDoc(file.name)}
                className={`w-full text-left group block rounded-lg transition-all duration-200 ${
                  selectedDoc === file.name
                    ? 'bg-primary/10'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="relative px-3 py-2.5">
                  {selectedDoc === file.name && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                  )}
                  <div className="flex items-start gap-2.5">
                    <FileText
                      size={16}
                      className={`mt-0.5 shrink-0 ${
                        selectedDoc === file.name
                          ? 'text-primary'
                          : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        selectedDoc === file.name
                          ? 'text-primary'
                          : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground'
                      }`}>
                        {file.label}
                      </p>
                      <p className="text-[11px] text-sidebar-foreground/30 mt-0.5 line-clamp-2">
                        {file.description}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </nav>
        </aside>
      </>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-background">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 lg:hidden bg-background/95 backdrop-blur border-b border-border/50">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{currentDoc?.label || 'Developer'}</p>
              <p className="text-[11px] text-muted-foreground truncate">{currentDoc?.description}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-sm text-muted-foreground">Cargando documento...</p>
              </div>
            </div>
          ) : (
            <MarkdownRenderer content={content} />
          )}
        </div>
      </div>
    </div>
  )
}

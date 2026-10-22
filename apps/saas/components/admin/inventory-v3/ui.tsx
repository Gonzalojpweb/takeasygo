'use client'

// ============================================================================
// Inventario V3 — piezas de interfaz compartidas (accesibles)
// ============================================================================
// · Estados de vista DIFERENCIADOS: cargando · error (con reintento) · vacío.
// · Campo con su error al lado (aria-invalid + aria-describedby).
// · Panel: lateral en escritorio, pantalla completa en el celular. El foco
//   entra al panel, queda atrapado y vuelve al disparador al cerrar (Radix).
// · Selector de insumos con teclado (combobox + listbox).
// · Áreas táctiles de 44 px como mínimo; nunca información solo por color.
// ============================================================================

import { useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, Plus, RefreshCw, Search, X, XCircle } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { ApiError } from './data/api'

export const btnPrimary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'
export const btnSecondary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-border bg-background px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'
export const btnGhost =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 disabled:opacity-50'
export const inputClass =
  'block min-h-11 w-full rounded-xl border-2 border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30 aria-[invalid=true]:border-red-600 disabled:opacity-60'

// ── Estados de vista ─────────────────────────────────────────────────────────

export function LoadingBlock({ label = 'Cargando…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} aria-hidden className="h-16 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  )
}

export function ErrorBlock({ error, onRetry, what }: { error: ApiError; onRetry?: () => void; what: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border-2 border-red-600/30 bg-red-50 p-5 text-red-900 dark:bg-red-950/30 dark:text-red-100">
      <div className="flex items-center gap-2 font-bold">
        <XCircle size={20} aria-hidden /> No pudimos cargar {what}
      </div>
      <p className="text-sm">{error.message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={btnSecondary}>
          <RefreshCw size={16} aria-hidden /> Reintentar
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center">
      {icon && <span aria-hidden className="text-muted-foreground">{icon}</span>}
      <h3 className="text-base font-bold">{title}</h3>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  )
}

/** Mensaje de éxito o error de una acción, anunciado por lectores de pantalla. */
export function Notice({ tone, children }: { tone: 'success' | 'error' | 'info'; children: React.ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertTriangle : CircleHelp
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-xl border-2 p-3 text-sm font-medium',
        tone === 'success' && 'border-emerald-600/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100',
        tone === 'error' && 'border-red-600/30 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100',
        tone === 'info' && 'border-border bg-muted/50 text-foreground',
      )}
    >
      <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

// ── Etiqueta de estado (texto + ícono; el color nunca va solo) ──────────────

export type Tone = 'neutral' | 'danger' | 'warning' | 'ok' | 'info'

export function StatusTag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : CircleHelp
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold',
        tone === 'danger' && 'border-red-600/40 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200',
        tone === 'warning' && 'border-amber-600/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
        tone === 'ok' && 'border-emerald-600/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
        (tone === 'neutral' || tone === 'info') && 'border-border bg-muted text-foreground',
      )}
    >
      <Icon size={14} aria-hidden />
      {children}
    </span>
  )
}

/** Filtro de lista: botón conmutable (aria-pressed), 44 px de alto. */
export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border-2 px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

// ── Campo con error al lado ─────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string | null
  /** Recibe los atributos de accesibilidad para el control. */
  children: (a11y: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => React.ReactNode
  className?: string
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-bold text-foreground">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="flex items-center gap-1 text-sm font-semibold text-red-700 dark:text-red-300">
          <AlertTriangle size={14} aria-hidden /> {error}
        </p>
      )}
    </div>
  )
}

// ── Panel lateral / pantalla completa ───────────────────────────────────────

export function Panel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn('flex h-full w-full flex-col gap-0 p-0 sm:max-w-xl', wide && 'sm:max-w-2xl')}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <SheetTitle className="text-lg font-black tracking-tight">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="mt-1 text-sm text-muted-foreground">{description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">{title}</SheetDescription>
            )}
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className={cn(btnGhost, 'min-w-11 shrink-0')} aria-label="Cerrar panel">
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-border bg-background px-5 py-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  )
}

// ── Selector de insumos con búsqueda (combobox accesible) ──────────────────

export interface PickerItem {
  id: string
  label: string
  meta?: string
}

export function SearchPicker({
  label,
  placeholder,
  items,
  onPick,
  onCreate,
  createLabel = 'Crear',
  error,
  autoFocus,
}: {
  label: string
  placeholder?: string
  items: PickerItem[]
  onPick: (id: string) => void
  /** Si existe, ofrece crear lo escrito cuando no hay coincidencia exacta. */
  onCreate?: (name: string) => void
  createLabel?: string
  error?: string | null
  autoFocus?: boolean
}) {
  const id = useId()
  const listId = `${id}-list`
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () => (q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items).slice(0, 8),
    [items, q],
  )
  const canCreate = Boolean(onCreate && q && !items.some((i) => i.label.toLowerCase() === q))
  const options = [...matches.map((m) => ({ kind: 'item' as const, ...m })), ...(canCreate ? [{ kind: 'create' as const, id: '__create', label: query.trim() }] : [])]

  function choose(index: number) {
    const opt = options[index]
    if (!opt) return
    if (opt.kind === 'create') onCreate?.(opt.label)
    else onPick(opt.id)
    setQuery('')
    setActive(0)
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <div className="relative">
        <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActive((a) => Math.min(a + 1, Math.max(options.length - 1, 0)))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              if (open && options.length > 0) {
                e.preventDefault()
                choose(active)
              }
            } else if (e.key === 'Escape') {
              if (open) {
                e.stopPropagation()
                setOpen(false)
              }
            }
          }}
          className={cn(inputClass, 'pl-10')}
        />
      </div>
      {error && <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      {open && options.length > 0 && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border-2 border-border bg-background p-1 shadow-lg">
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(i)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-sm', i === active && 'bg-muted')}
            >
              {o.kind === 'create' ? (
                <span className="flex items-center gap-2 font-bold">
                  <Plus size={16} aria-hidden /> {createLabel} «{o.label}»
                </span>
              ) : (
                <>
                  <span className="font-semibold">{o.label}</span>
                  {'meta' in o && o.meta && <span className="text-xs text-muted-foreground">{o.meta}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <Loader2 size={16} aria-hidden className="animate-spin" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

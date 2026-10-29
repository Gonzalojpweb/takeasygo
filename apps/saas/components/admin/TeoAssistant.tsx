'use client'

// ── TeoAssistant ─────────────────────────────────────────────────────────────
//
// Widget flotante de TEO (TakeasyGO Expert Operator) en el panel admin.
//
// - Sin proveedor configurado (ANTHROPIC_API_KEY): presentación + «próximamente».
// - Configurado: chat de soporte contra /api/[tenant]/assistant/chat (harness
//   v1, solo lectura, sin streaming). Pulgar arriba/abajo y «Contactar a
//   soporte» por respuesta (/assistant/feedback).
// - El rol, el negocio y los módulos los decide el servidor; acá solo viaja
//   el texto. El historial también lo arma el servidor (por conversación).
// - Dismissible con localStorage; la conversación vive solo en la pestaña.

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { X, Send, ThumbsUp, ThumbsDown, LifeBuoy, Loader2, RotateCcw } from 'lucide-react'

const STORAGE_KEY = 'teo-assistant-dismissed'
const AUTO_OPEN_DELAY_MS = 1800

type Phase = 'hidden' | 'collapsed' | 'open'

interface Status {
  available: boolean
  maxMessageChars: number
  supportWhatsapp: string | null
}

interface Turn {
  id: string
  role: 'user' | 'teo'
  text: string
  logId?: string | null
  rating?: 1 | -1 | null
  escalated?: boolean
  suggestSupport?: boolean
}

function newConversationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Texto de TEO: párrafos y **negrita** (el filtro de salida ya bloqueó código/HTML). */
function TeoText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-line leading-relaxed [&+p]:mt-2">
          {para.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
            chunk.startsWith('**') && chunk.endsWith('**') ? (
              <strong key={j} className="font-semibold text-foreground">{chunk.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{chunk}</span>
            )
          )}
        </p>
      ))}
    </>
  )
}

function Avatar({ size }: { size: number }) {
  return (
    <Image
      src="/teo/TEO.png"
      alt="TEO"
      width={size}
      height={size}
      className="w-full h-full object-cover object-top scale-125 translate-y-0.5"
      priority={false}
    />
  )
}

export default function TeoAssistant({ tenantSlug }: { tenantSlug: string }) {
  const [phase, setPhase] = useState<Phase>('hidden')
  const [status, setStatus] = useState<Status | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState(newConversationId)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let wasDismissed = false
    try {
      wasDismissed = localStorage.getItem(STORAGE_KEY) === '1'
    } catch {}
    const timer = setTimeout(() => setPhase(wasDismissed ? 'collapsed' : 'open'), wasDismissed ? 0 : AUTO_OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let alive = true
    fetch(`/api/${tenantSlug}/assistant/chat`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Status | null) => {
        if (alive) setStatus(s ?? { available: false, maxMessageChars: 1000, supportWhatsapp: null })
      })
      .catch(() => alive && setStatus({ available: false, maxMessageChars: 1000, supportWhatsapp: null }))
    return () => {
      alive = false
    }
  }, [tenantSlug])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, sending])

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {}
    setPhase('collapsed')
  }

  const handleReopen = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
    setPhase('open')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const send = useCallback(async () => {
    const message = draft.trim()
    if (!message || sending) return
    setDraft('')
    setTurns((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: message }])
    setSending(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message }),
      })
      const data = await res.json().catch(() => ({}))
      const text: string = res.ok ? data.reply : data.error || 'No pude responder en este momento.'
      setTurns((prev) => [
        ...prev,
        { id: `t-${Date.now()}`, role: 'teo', text, logId: data.logId ?? null, suggestSupport: Boolean(data.suggestSupport) },
      ])
    } catch {
      setTurns((prev) => [...prev, { id: `t-${Date.now()}`, role: 'teo', text: 'Sin conexión. Probá de nuevo en un momento.' }])
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [draft, sending, tenantSlug, conversationId])

  const feedback = useCallback(
    async (turn: Turn, patch: { rating?: 1 | -1 | null; escalate?: true }) => {
      if (!turn.logId) return
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turn.id
            ? { ...t, ...(patch.rating !== undefined ? { rating: patch.rating } : {}), ...(patch.escalate ? { escalated: true } : {}) }
            : t
        )
      )
      try {
        await fetch(`/api/${tenantSlug}/assistant/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logId: turn.logId, ...patch }),
        })
      } catch {}
      if (patch.escalate && status?.supportWhatsapp) {
        const lastQuestion = [...turns].reverse().find((t) => t.role === 'user')?.text ?? ''
        const text = encodeURIComponent(`Hola, necesito ayuda con TakeasyGO (${tenantSlug}). Consulta: ${lastQuestion}`)
        window.open(`https://wa.me/${status.supportWhatsapp}?text=${text}`, '_blank', 'noopener')
      }
    },
    [tenantSlug, status, turns]
  )

  const restart = () => {
    setTurns([])
    setConversationId(newConversationId())
  }

  if (phase === 'hidden') return null

  if (phase === 'collapsed') {
    return (
      <button
        onClick={handleReopen}
        className="fixed bottom-6 right-6 z-50 group animate-in fade-in slide-in-from-bottom-2 duration-300"
        aria-label="Abrir asistente TEO"
        title="TEO — Tu asistente de soporte"
      >
        <div className="relative">
          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-background animate-pulse" />
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary/30 shadow-lg shadow-primary/20 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-primary/30 transition-all duration-300 bg-white">
            <Avatar size={56} />
          </div>
        </div>
      </button>
    )
  }

  // ── Presentación (todavía sin proveedor configurado) ──────────────────────
  if (!status?.available) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="relative flex items-end gap-3">
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl rounded-br-md border border-border shadow-xl shadow-black/10 p-4 pr-8 max-w-[300px]">
            <button onClick={handleDismiss} className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors" aria-label="Cerrar">
              <X size={14} className="text-muted-foreground" />
            </button>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">TEO · Tu asistente</span>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-foreground">¡Hola! Soy TEO 👋</p>
              <p className="text-muted-foreground leading-relaxed">Estoy acá para ayudarte a trabajar mejor con TakeasyGO.</p>
              <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Estoy por entrar en acción.</span> En los próximos días voy a
                  acompañarte con tus dudas, configuraciones y la operación diaria — disponible 24/7.
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic">Pronto vas a poder consultarme directamente desde acá.</p>
            </div>
          </div>
          <button onClick={handleDismiss} className="relative shrink-0 group" aria-label="Cerrar TEO">
            <div className="relative">
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background z-10 animate-pulse" />
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20 shadow-lg shadow-primary/15 group-hover:scale-105 transition-all duration-300 bg-white animate-teo-float">
                <Avatar size={80} />
              </div>
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  const remaining = status.maxMessageChars - draft.length
  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 sm:w-[380px] max-h-[min(640px,calc(100dvh-2rem))] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-border shadow-2xl shadow-black/15 animate-in fade-in slide-in-from-bottom-4 duration-300"
      role="dialog"
      aria-label="Chat con TEO"
    >
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/20 bg-white shrink-0">
          <Avatar size={40} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">TEO</p>
          <p className="text-xs text-muted-foreground leading-tight">Asistente de soporte de TakeasyGO</p>
        </div>
        {turns.length > 0 && (
          <button onClick={restart} className="p-1.5 rounded-full hover:bg-muted transition-colors" aria-label="Nueva conversación" title="Nueva conversación">
            <RotateCcw size={15} className="text-muted-foreground" />
          </button>
        )}
        <button onClick={handleDismiss} className="p-1.5 rounded-full hover:bg-muted transition-colors" aria-label="Cerrar">
          <X size={16} className="text-muted-foreground" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm min-h-[220px]">
        {turns.length === 0 && (
          <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">¡Hola! Soy TEO 👋</p>
            <p className="leading-relaxed">
              Preguntame cómo usar TakeasyGO: configuraciones, módulos de tu plan, errores o qué puede hacer cada rol.
            </p>
          </div>
        )}
        {turns.map((t) =>
          t.role === 'user' ? (
            <div key={t.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3 py-2 whitespace-pre-line break-words">{t.text}</div>
            </div>
          ) : (
            <div key={t.id} className="flex flex-col items-start gap-1">
              <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-muted-foreground break-words">
                <TeoText text={t.text} />
              </div>
              {t.logId && (
                <div className="flex items-center gap-1 pl-1">
                  <button
                    onClick={() => feedback(t, { rating: t.rating === 1 ? null : 1 })}
                    className={`p-1 rounded hover:bg-muted ${t.rating === 1 ? 'text-emerald-600' : 'text-muted-foreground'}`}
                    aria-label="Me sirvió"
                    aria-pressed={t.rating === 1}
                  >
                    <ThumbsUp size={13} />
                  </button>
                  <button
                    onClick={() => feedback(t, { rating: t.rating === -1 ? null : -1 })}
                    className={`p-1 rounded hover:bg-muted ${t.rating === -1 ? 'text-red-600' : 'text-muted-foreground'}`}
                    aria-label="No me sirvió"
                    aria-pressed={t.rating === -1}
                  >
                    <ThumbsDown size={13} />
                  </button>
                  <button
                    onClick={() => feedback(t, { escalate: true })}
                    disabled={t.escalated}
                    className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border ${
                      t.suggestSupport && !t.escalated ? 'border-primary text-primary' : 'border-border text-muted-foreground'
                    } hover:bg-muted disabled:opacity-70`}
                  >
                    <LifeBuoy size={12} />
                    {t.escalated ? 'Soporte avisado' : 'Contactar a soporte'}
                  </button>
                </div>
              )}
            </div>
          )
        )}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> TEO está escribiendo…
          </div>
        )}
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, status.maxMessageChars))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            maxLength={status.maxMessageChars}
            placeholder="Escribí tu consulta…"
            className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-28"
            aria-label="Tu consulta para TEO"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="shrink-0 rounded-xl bg-primary text-primary-foreground p-2.5 disabled:opacity-50"
            aria-label="Enviar"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {remaining < 100 ? `${remaining} caracteres disponibles · ` : ''}TEO responde con la documentación de TakeasyGO; puede equivocarse.
        </p>
      </form>
    </div>
  )
}

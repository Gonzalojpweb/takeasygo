import { useCallback, useEffect, useMemo, useState } from "react"
import { Printer, Receipt, Plus, Clock, Trash2, Bike } from "lucide-react"
import { FISCAL_DOCUMENTS, PRINTER_DOCUMENTS, PRINTER_DOCUMENT_LABELS, type PrinterDocument } from "@takeasygo/business/browser"
import { useAuth } from "../../hooks/useAuth"
import { useLayout } from "../layout/LayoutContext"
import {
  createPrinter,
  getFiscalConfig,
  getShiftsConfig,
  getDeliveryPlatforms,
  saveDeliveryPlatforms,
  saveShiftsConfig,
  listPrinters,
  previewDocument,
  setInvoicingMode,
  updatePrinter,
  type FiscalConfigView,
  type FontSize,
  type PosPrinter,
  type PreviewLine,
  type PrintersConfig,
  type ShiftConfig,
  type DeliveryPlatformSetting,
} from "../../services/config"

// ============================================================================
// Contexto Configuración del POS (Fase 1, 29/10/2026)
// ============================================================================
// Sidebar propio con un workspace por sección. Admin y encargado.
//   · Impresoras: qué documentos imprime cada una, ancho (58/80 mm),
//     estilos y vista previa con datos de ejemplo. Tope de impresoras por
//     sede según el plan.
//   · Comprobantes: cómo factura la sede; el modo de cobro lo cambia el
//     admin. Certificado y puntos de venta quedan en el panel web.
// Las secciones de Cajas, Turnos, Deliverys y Dispositivos se suman en las
// fases siguientes.
// ============================================================================

type Section = "impresoras" | "comprobantes" | "turnos" | "deliverys"

const SECTIONS: { id: Section; label: string; hint: string; icon: typeof Printer }[] = [
  { id: "impresoras", label: "Impresoras", hint: "Qué imprime cada una", icon: Printer },
  { id: "comprobantes", label: "Comprobantes", hint: "Cómo factura la sede", icon: Receipt },
  { id: "turnos", label: "Turnos", hint: "Un turno, una caja", icon: Clock },
  { id: "deliverys", label: "Deliverys", hint: "PedidosYa, Rappi y otras", icon: Bike },
]

const STATUS_LABEL: Record<string, string> = { ok: "Imprimiendo bien", error: "Con error", offline: "Sin conexión", unknown: "Sin datos todavía" }
const FONT_LABEL: Record<FontSize, string> = { normal: "Normal", large: "Grande", double: "Doble", triple: "Triple" }
const MODE_LABEL: Record<FiscalConfigView["invoicingMode"], { title: string; hint: string }> = {
  ask: { title: "Preguntar en cada cobro", hint: "El cajero elige si factura o entrega ticket no fiscal." },
  always: { title: "Facturar siempre", hint: "Cada cobro emite factura (consumidor final si no se carga otro dato)." },
  off: { title: "No facturar desde el POS", hint: "Solo ticket no fiscal." },
}

interface Draft {
  id: string | null
  name: string
  ip: string
  port: string
  paperWidth: 58 | 80
  documents: PrinterDocument[]
  kitchenFont: FontSize
  cashierFont: FontSize
  showPricesOnComanda: boolean
  header: string
  footer: string
}

function draftFrom(p: PosPrinter | null): Draft {
  return {
    id: p?.id ?? null,
    name: p?.name ?? "",
    ip: p?.ip ?? "",
    port: String(p?.port ?? 9100),
    paperWidth: p?.paperWidth ?? 80,
    documents: p?.documents ?? ["comanda"],
    kitchenFont: (p?.printSettings.kitchen?.fontSize as FontSize) ?? "large",
    cashierFont: (p?.printSettings.cashier?.fontSize as FontSize) ?? "normal",
    showPricesOnComanda: p?.printSettings.kitchen?.showPrices ?? false,
    header: p?.printSettings.cashier?.headerTemplate ?? "",
    footer: p?.printSettings.cashier?.footerTemplate ?? "",
  }
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

export function ConfigDashboard({ role }: { role?: string }) {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const { setContextPanel, setActionBar } = useLayout()
  const isAdmin = role === "admin"

  const [section, setSection] = useState<Section>("impresoras")
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // Impresoras
  const [config, setConfig] = useState<PrintersConfig | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [previewDoc, setPreviewDoc] = useState<PrinterDocument>("precuenta")
  const [preview, setPreview] = useState<{ columns: number; lines: PreviewLine[] } | null>(null)

  // Comprobantes
  const [fiscal, setFiscal] = useState<FiscalConfigView | null>(null)

  // Turnos (Fase 2): los define el admin; el encargado los ve.
  const [shifts, setShifts] = useState<ShiftConfig[] | null>(null)
  const [shiftsDirty, setShiftsDirty] = useState(false)

  // Deliverys externos (Fase 5).
  const [platforms, setPlatforms] = useState<DeliveryPlatformSetting[] | null>(null)
  const [platformsDirty, setPlatformsDirty] = useState(false)

  const flash = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text })
    setTimeout(() => setNotice(null), 4000)
  }, [])

  const loadPrinters = useCallback(async () => {
    if (!tenantId) return
    try {
      setConfig(await listPrinters(tenantId))
    } catch (err) {
      flash("error", errorText(err, "No se pudieron cargar las impresoras"))
    }
  }, [tenantId, flash])

  const loadFiscal = useCallback(async () => {
    if (!tenantId) return
    try {
      setFiscal(await getFiscalConfig(tenantId))
    } catch (err) {
      flash("error", errorText(err, "No se pudo cargar la configuración fiscal"))
    }
  }, [tenantId, flash])

  const loadPlatforms = useCallback(async () => {
    if (!tenantId) return
    try {
      setPlatforms(await getDeliveryPlatforms(tenantId))
      setPlatformsDirty(false)
    } catch (err) {
      flash("error", errorText(err, "No se pudieron cargar los deliverys"))
    }
  }, [tenantId, flash])

  const loadShifts = useCallback(async () => {
    if (!tenantId) return
    try {
      setShifts((await getShiftsConfig(tenantId)).shifts)
      setShiftsDirty(false)
    } catch (err) {
      flash("error", errorText(err, "No se pudieron cargar los turnos"))
    }
  }, [tenantId, flash])

  useEffect(() => {
    const id = setTimeout(() => {
      void (section === "impresoras" ? loadPrinters() : section === "comprobantes" ? loadFiscal() : section === "turnos" ? loadShifts() : loadPlatforms())
    }, 0)
    return () => clearTimeout(id)
  }, [section, loadPrinters, loadFiscal, loadShifts, loadPlatforms])

  const editPlatform = (id: string, patch: Partial<DeliveryPlatformSetting>) => {
    setPlatforms((list) => (list ? list.map((x) => (x.id === id ? { ...x, ...patch } : x)) : list))
    setPlatformsDirty(true)
  }

  const savePlatforms = useCallback(async () => {
    if (!tenantId || !platforms) return
    setBusy(true)
    try {
      setPlatforms(await saveDeliveryPlatforms(tenantId, platforms))
      setPlatformsDirty(false)
      flash("success", "Deliverys guardados")
    } catch (err) {
      flash("error", errorText(err, "No se pudieron guardar los deliverys"))
    } finally {
      setBusy(false)
    }
  }, [tenantId, platforms, flash])

  const editShift = (i: number, patch: Partial<ShiftConfig>) => {
    setShifts((list) => (list ? list.map((x, j) => (j === i ? { ...x, ...patch } : x)) : list))
    setShiftsDirty(true)
  }

  const saveShifts = useCallback(async () => {
    if (!tenantId || !shifts) return
    setBusy(true)
    try {
      setShifts((await saveShiftsConfig(tenantId, shifts)).shifts)
      setShiftsDirty(false)
      flash("success", "Turnos guardados")
    } catch (err) {
      flash("error", errorText(err, "No se pudieron guardar los turnos"))
    } finally {
      setBusy(false)
    }
  }, [tenantId, shifts, flash])

  // Vista previa: ancho de la impresora en edición (o 80 mm).
  const previewWidth = draft?.paperWidth ?? 80
  useEffect(() => {
    if (!tenantId || section !== "impresoras") return
    let alive = true
    const id = setTimeout(() => {
      previewDocument(tenantId, previewDoc, previewWidth, { header: draft?.header, footer: draft?.footer })
        .then((p) => { if (alive) setPreview(p) })
        .catch(() => { if (alive) setPreview(null) })
    }, 250)
    return () => { alive = false; clearTimeout(id) }
  }, [tenantId, section, previewDoc, previewWidth, draft?.header, draft?.footer])

  const canAdd = config ? config.active < config.limit : false

  const savePrinter = useCallback(async () => {
    if (!tenantId || !draft) return
    const port = Number(draft.port)
    if (!draft.name.trim()) return flash("error", "Poné un nombre a la impresora")
    if (!Number.isInteger(port) || port < 1 || port > 65535) return flash("error", "El puerto tiene que ser un número entre 1 y 65535")
    if (draft.documents.length === 0) return flash("error", "Elegí al menos un documento")
    const input = {
      name: draft.name.trim(),
      ip: draft.ip.trim(),
      port,
      paperWidth: draft.paperWidth,
      documents: draft.documents,
      printSettings: {
        kitchen: { fontSize: draft.kitchenFont, showPrices: draft.showPricesOnComanda },
        bar: { fontSize: draft.kitchenFont, showPrices: draft.showPricesOnComanda },
        cashier: { fontSize: draft.cashierFont, headerTemplate: draft.header, footerTemplate: draft.footer },
      },
    }
    setBusy(true)
    try {
      if (draft.id) {
        await updatePrinter(tenantId, draft.id, input)
        flash("success", "Impresora guardada")
      } else {
        const { printSettings, ...create } = input
        const created = await createPrinter(tenantId, create)
        await updatePrinter(tenantId, created.id, { printSettings })
        flash("success", "Impresora agregada")
      }
      setDraft(null)
      await loadPrinters()
    } catch (err) {
      flash("error", errorText(err, "No se pudo guardar la impresora"))
    } finally {
      setBusy(false)
    }
  }, [tenantId, draft, flash, loadPrinters])

  const toggleActive = useCallback(async (p: PosPrinter) => {
    if (!tenantId) return
    setBusy(true)
    try {
      await updatePrinter(tenantId, p.id, { isActive: !p.isActive })
      flash("success", p.isActive ? "Impresora desactivada" : "Impresora activada")
      setDraft(null)
      await loadPrinters()
    } catch (err) {
      flash("error", errorText(err, "No se pudo cambiar el estado"))
    } finally {
      setBusy(false)
    }
  }, [tenantId, flash, loadPrinters])

  const changeMode = useCallback(async (mode: FiscalConfigView["invoicingMode"]) => {
    if (!tenantId || !isAdmin) return
    setBusy(true)
    try {
      setFiscal(await setInvoicingMode(tenantId, mode))
      flash("success", "Modo de facturación actualizado")
    } catch (err) {
      flash("error", errorText(err, "No se pudo cambiar el modo"))
    } finally {
      setBusy(false)
    }
  }, [tenantId, isAdmin, flash])

  const editing = draft ? config?.printers.find((p) => p.id === draft.id) ?? null : null

  // ── Context panel + action bar ──────────────────────────────────────────
  useEffect(() => {
    if (section === "impresoras" && draft) {
      const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
      const toggleDoc = (doc: PrinterDocument) =>
        set({ documents: draft.documents.includes(doc) ? draft.documents.filter((d) => d !== doc) : [...draft.documents, doc] })
      setContextPanel({
        title: draft.id ? draft.name || "Impresora" : "Nueva impresora",
        subtitle: draft.id ? `${editing?.ip ?? ""} · ${draft.paperWidth} mm` : "Red local (TCP)",
        openOnMobile: true,
        body: (
          <div className="config-form">
            <label className="config-field">
              <span>Nombre</span>
              <input id="cfg-printer-name" className="search-input" value={draft.name} maxLength={60} placeholder="Caja principal" onChange={(e) => set({ name: e.target.value })} />
            </label>
            <div className="config-row">
              <label className="config-field">
                <span>IP</span>
                <input id="cfg-printer-ip" className="search-input" value={draft.ip} inputMode="decimal" placeholder="192.168.0.50" onChange={(e) => set({ ip: e.target.value })} />
              </label>
              <label className="config-field config-field--short">
                <span>Puerto</span>
                <input id="cfg-printer-port" className="search-input" value={draft.port} inputMode="numeric" onChange={(e) => set({ port: e.target.value.replace(/\D/g, "") })} />
              </label>
            </div>
            <div className="config-field">
              <span>Ancho del papel</span>
              <div className="sales-chips" role="group" aria-label="Ancho del papel">
                {([58, 80] as const).map((w) => (
                  <button key={w} type="button" className={`sales-chip${draft.paperWidth === w ? " active" : ""}`} aria-pressed={draft.paperWidth === w} onClick={() => set({ paperWidth: w })}>
                    {w} mm · {w === 58 ? 32 : 48} col.
                  </button>
                ))}
              </div>
            </div>
            <fieldset className="config-field config-docs">
              <legend>Qué imprime</legend>
              {PRINTER_DOCUMENTS.map((doc) => (
                <label key={doc} className="config-check">
                  <input type="checkbox" checked={draft.documents.includes(doc)} onChange={() => toggleDoc(doc)} />
                  <span>{PRINTER_DOCUMENT_LABELS[doc]}</span>
                  {FISCAL_DOCUMENTS.includes(doc) && <em className="config-tag">fiscal</em>}
                </label>
              ))}
            </fieldset>
            <div className="sale-section-title">Estilos</div>
            {draft.documents.includes("comanda") && (
              <>
                <label className="config-field">
                  <span>Letra de las comandas</span>
                  <select id="cfg-kitchen-font" className="search-input" value={draft.kitchenFont} onChange={(e) => set({ kitchenFont: e.target.value as FontSize })}>
                    {(Object.keys(FONT_LABEL) as FontSize[]).map((f) => <option key={f} value={f}>{FONT_LABEL[f]}</option>)}
                  </select>
                </label>
                <label className="config-check">
                  <input type="checkbox" checked={draft.showPricesOnComanda} onChange={(e) => set({ showPricesOnComanda: e.target.checked })} />
                  <span>Mostrar precios en la comanda</span>
                </label>
              </>
            )}
            {draft.documents.some((d) => d !== "comanda") && (
              <>
                <label className="config-field">
                  <span>Letra de tickets y comprobantes</span>
                  <select id="cfg-cashier-font" className="search-input" value={draft.cashierFont} onChange={(e) => set({ cashierFont: e.target.value as FontSize })}>
                    {(Object.keys(FONT_LABEL) as FontSize[]).map((f) => <option key={f} value={f}>{FONT_LABEL[f]}</option>)}
                  </select>
                </label>
                <label className="config-field">
                  <span>Encabezado (opcional)</span>
                  <textarea id="cfg-header" className="search-input" rows={2} maxLength={200} value={draft.header} placeholder="¡Gracias por venir!" onChange={(e) => set({ header: e.target.value })} />
                </label>
                <label className="config-field">
                  <span>Pie (opcional)</span>
                  <textarea id="cfg-footer" className="search-input" rows={2} maxLength={200} value={draft.footer} placeholder="Wi-Fi: CafeDemo" onChange={(e) => set({ footer: e.target.value })} />
                </label>
              </>
            )}
            {editing && editing.lastStatus !== "unknown" && (
              <p className={`config-status ${editing.lastStatus}`}>{STATUS_LABEL[editing.lastStatus] ?? editing.lastStatus}{editing.lastError ? ` · ${editing.lastError}` : ""}</p>
            )}
          </div>
        ),
      })
      setActionBar({
        left: <button className="btn btn-ghost" disabled={busy} onClick={() => setDraft(null)}>Cancelar</button>,
        center: editing ? (
          <button className="btn btn-ghost" disabled={busy} onClick={() => { void toggleActive(editing) }}>{editing.isActive ? "Desactivar" : "Activar"}</button>
        ) : undefined,
        right: <button className="btn btn-primary" disabled={busy} onClick={() => { void savePrinter() }}>{draft.id ? "Guardar" : "Agregar"}</button>,
      })
      return
    }
    if (section === "deliverys") {
      setContextPanel({
        title: "Deliverys externos",
        subtitle: platforms ? `${platforms.filter((x) => x.enabled).length} activas` : undefined,
        body: (
          <p className="cash-help">
            La comisión se descuenta de lo vendido en cada plataforma y se ve en Ventas como neto. Si cobra la plataforma, la venta no entra a la caja
            (se concilia con la liquidación); si cobra el local al entregar, entra a la caja del turno.
          </p>
        ),
      })
      setActionBar({
        left: platformsDirty ? <button className="btn btn-ghost" disabled={busy} onClick={() => { void loadPlatforms() }}>Descartar</button> : undefined,
        right: <button className="btn btn-primary" disabled={busy || !platformsDirty} onClick={() => { void savePlatforms() }}>Guardar</button>,
      })
      return
    }
    if (section === "turnos") {
      setContextPanel({
        title: "Turnos",
        subtitle: shifts ? `${shifts.filter((x) => x.active).length} activos` : undefined,
        body: (
          <p className="cash-help">
            Cada turno tiene una sola caja por jornada. Al abrir la caja, el POS propone el turno según la hora de la sede; el cajero puede elegir otro libre.
            Un turno puede cruzar la medianoche (por ejemplo 20:00 a 02:00). Los turnos activos no se pueden superponer.
          </p>
        ),
      })
      setActionBar(isAdmin ? {
        left: shiftsDirty ? <button className="btn btn-ghost" disabled={busy} onClick={() => { void loadShifts() }}>Descartar</button> : undefined,
        right: <button className="btn btn-primary" disabled={busy || !shiftsDirty} onClick={() => { void saveShifts() }}>Guardar turnos</button>,
      } : null)
      return
    }
    setContextPanel({
      title: section === "impresoras" ? "Impresoras" : "Comprobantes",
      subtitle: section === "impresoras" && config ? `${config.active} de ${config.limit} activas en la sede` : undefined,
      body: (
        <p className="cash-help">
          {section === "impresoras"
            ? "Tocá una impresora para editarla. Las comandas van a cocina o barra; la precuenta, los tickets, las facturas y los reportes de caja, a la impresora de caja."
            : "El certificado de ARCA, el CUIT y los puntos de venta se cargan en el panel web (Factura electrónica). Acá se elige qué hace el cobro."}
        </p>
      ),
    })
    setActionBar(null)
  }, [section, draft, editing, config, busy, shifts, shiftsDirty, platforms, platformsDirty, isAdmin, setContextPanel, setActionBar, savePrinter, toggleActive, saveShifts, loadShifts, savePlatforms, loadPlatforms])

  const docsInUse = useMemo(() => new Set((config?.printers ?? []).filter((p) => p.isActive).flatMap((p) => p.documents)), [config])
  const missing = (["comanda", "precuenta", "factura", "reporte_caja"] as PrinterDocument[]).filter((d) => config && !docsInUse.has(d))

  return (
    <div className="workspace config">
      <div className="config-shell">
        <nav className="config-nav" aria-label="Secciones de configuración">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            return (
              <button key={s.id} type="button" className={`config-nav-item${section === s.id ? " active" : ""}`} aria-current={section === s.id ? "page" : undefined} onClick={() => { setSection(s.id); setDraft(null) }}>
                <Icon size={18} aria-hidden />
                <span><b>{s.label}</b><small>{s.hint}</small></span>
              </button>
            )
          })}
          <p className="config-nav-soon">Dispositivos y emparejamiento: próximamente.</p>
        </nav>

        <div className="config-body">
          {notice && <div className={`config-notice ${notice.kind}`} role="status">{notice.text}</div>}

          {section === "impresoras" && (
            <div className="config-printers">
              <div className="config-section-head">
                <div>
                  <h2>Impresoras de la sede</h2>
                  <p>{config ? `${config.active} de ${config.limit} activas · el tope depende del plan` : "Cargando…"}</p>
                </div>
                <button type="button" className="btn btn-primary btn-sm" disabled={!canAdd || busy} onClick={() => setDraft(draftFrom(null))} title={canAdd ? undefined : "Llegaste al tope de impresoras del plan"}>
                  <Plus size={16} aria-hidden /> Agregar
                </button>
              </div>

              {missing.length > 0 && (
                <div className="setup-error" role="note">
                  Ninguna impresora activa imprime: {missing.map((d) => PRINTER_DOCUMENT_LABELS[d]).join(", ")}.
                </div>
              )}

              <div className="config-list">
                {config?.printers.length === 0 && <p className="cash-help">Todavía no hay impresoras en esta sede.</p>}
                {config?.printers.map((p) => (
                  <button key={p.id} type="button" className={`config-printer${draft?.id === p.id ? " selected" : ""}${p.isActive ? "" : " inactive"}`} onClick={() => setDraft(draftFrom(p))}>
                    <span className={`config-dot ${p.lastStatus}`} aria-label={STATUS_LABEL[p.lastStatus] ?? p.lastStatus} />
                    <span className="config-printer-main">
                      <b>{p.name}</b>
                      <small>{p.ip}:{p.port} · {p.paperWidth} mm{p.isActive ? "" : " · desactivada"}</small>
                    </span>
                    <span className="config-chips">
                      {p.documents.map((d) => <span key={d} className={`config-chip${FISCAL_DOCUMENTS.includes(d) ? " fiscal" : ""}`}>{PRINTER_DOCUMENT_LABELS[d].split(" (")[0]}</span>)}
                    </span>
                  </button>
                ))}
              </div>

              <div className="config-preview">
                <div className="config-section-head">
                  <div>
                    <h3>Vista previa</h3>
                    <p>{previewWidth} mm · datos de ejemplo</p>
                  </div>
                  <select id="cfg-preview-doc" className="search-input" value={previewDoc} onChange={(e) => setPreviewDoc(e.target.value as PrinterDocument)} aria-label="Documento a previsualizar">
                    {PRINTER_DOCUMENTS.map((d) => <option key={d} value={d}>{PRINTER_DOCUMENT_LABELS[d]}</option>)}
                  </select>
                </div>
                <div className="ticket-paper" style={{ width: `${(preview?.columns ?? 48) + 4}ch` }} aria-label="Vista previa del ticket">
                  {preview?.lines.map((l, i) => (
                    <div key={i} className={`ticket-line${l.bold ? " bold" : ""}${l.center ? " center" : ""}${l.large ? " large" : ""}`}>{l.text || " "}</div>
                  )) ?? <div className="ticket-line">Cargando…</div>}
                </div>
              </div>
            </div>
          )}

          {section === "deliverys" && (
            <div className="config-fiscal">
              <div className="config-section-head">
                <div>
                  <h2>Deliverys externos</h2>
                  <p>Comisión y quién cobra, por plataforma</p>
                </div>
              </div>
              <fieldset className="config-modes" disabled={busy}>
                {platforms?.map((pf) => (
                  <div key={pf.id} className={`config-platform${pf.enabled ? " active" : ""}`}>
                    <label className="config-check">
                      <input type="checkbox" checked={pf.enabled} onChange={(e) => editPlatform(pf.id, { enabled: e.target.checked })} />
                      <span><b>{pf.label}</b></span>
                    </label>
                    <label className="config-field config-field--short">
                      <span>Comisión %</span>
                      <input id={`pf-commission-${pf.id}`} className="search-input" type="number" min={0} max={60} step={0.01} inputMode="decimal" value={pf.commissionPercent} disabled={!pf.enabled} onChange={(e) => editPlatform(pf.id, { commissionPercent: Number(e.target.value) || 0 })} />
                    </label>
                    <div className="sales-chips" role="group" aria-label={`Quién cobra en ${pf.label}`}>
                      {([["platform", "Cobra la plataforma"], ["local", "Cobra el local"]] as const).map(([v, label]) => (
                        <button key={v} type="button" disabled={!pf.enabled} className={`sales-chip${pf.settlement === v ? " active" : ""}`} aria-pressed={pf.settlement === v} onClick={() => editPlatform(pf.id, { settlement: v })}>{label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>
            </div>
          )}

          {section === "turnos" && (
            <div className="config-fiscal">
              <div className="config-section-head">
                <div>
                  <h2>Turnos de caja</h2>
                  <p>{isAdmin ? "Definí cuántos turnos tiene la sede y su horario" : "Los turnos los define el administrador"}</p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy || (shifts?.length ?? 0) >= 8}
                    onClick={() => { setShifts((l) => [...(l ?? []), { name: "", start: "08:00", end: "16:00", active: true }]); setShiftsDirty(true) }}
                  >
                    <Plus size={16} aria-hidden /> Agregar turno
                  </button>
                )}
              </div>
              {shifts?.length === 0 && (
                <p className="cash-help">Sin turnos: la caja se abre y se cierra sin turno, como hasta ahora.</p>
              )}
              <fieldset className="config-modes" disabled={!isAdmin || busy}>
                {shifts?.map((t, i) => (
                  <div key={t.id ?? `nuevo-${i}`} className="config-shift-row">
                    <input id={`shift-name-${i}`} className="search-input" aria-label="Nombre del turno" placeholder="Mañana" maxLength={30} value={t.name} onChange={(e) => editShift(i, { name: e.target.value })} />
                    <input id={`shift-start-${i}`} className="search-input" type="time" aria-label="Empieza" value={t.start} onChange={(e) => editShift(i, { start: e.target.value })} />
                    <input id={`shift-end-${i}`} className="search-input" type="time" aria-label="Termina" value={t.end} onChange={(e) => editShift(i, { end: e.target.value })} />
                    <label className="config-check">
                      <input type="checkbox" checked={t.active} onChange={(e) => editShift(i, { active: e.target.checked })} />
                      <span>Activo</span>
                    </label>
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Quitar el turno ${t.name || i + 1}`} onClick={() => { setShifts((l) => (l ?? []).filter((_, j) => j !== i)); setShiftsDirty(true) }}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                ))}
              </fieldset>
            </div>
          )}

          {section === "comprobantes" && (
            <div className="config-fiscal">
              <div className="config-section-head">
                <div>
                  <h2>Comprobantes</h2>
                  <p>Cómo factura esta sede</p>
                </div>
              </div>
              {fiscal && !fiscal.configured && (
                <div className="setup-error" role="note">La factura electrónica todavía no está configurada. La carga el administrador en el panel web (Factura electrónica): CUIT, certificado de ARCA y punto de venta.</div>
              )}
              {fiscal?.configured && (
                <dl className="config-facts">
                  <div><dt>Razón social</dt><dd>{fiscal.legalName || "—"}</dd></div>
                  <div><dt>Condición frente al IVA</dt><dd>{fiscal.ivaConditionLabel}</dd></div>
                  <div><dt>A consumidor final</dt><dd>Factura {fiscal.letterForFinalConsumer}</dd></div>
                  <div><dt>A empresas (CUIT)</dt><dd>Factura {fiscal.letterForCompany}</dd></div>
                  <div><dt>Punto de venta de la sede</dt><dd>{fiscal.pointOfSale ? String(fiscal.pointOfSale).padStart(5, "0") : "Sin asignar"}</dd></div>
                  <div><dt>Ambiente</dt><dd>{fiscal.environment === "production" ? "Producción" : "Pruebas (sin validez fiscal)"}</dd></div>
                </dl>
              )}
              {fiscal?.configured && (
                <fieldset className="config-modes" disabled={!isAdmin || busy}>
                  <legend>Al cobrar</legend>
                  {(Object.keys(MODE_LABEL) as FiscalConfigView["invoicingMode"][]).map((m) => (
                    <label key={m} className={`config-mode${fiscal.invoicingMode === m ? " active" : ""}`}>
                      <input type="radio" name="invoicing-mode" checked={fiscal.invoicingMode === m} onChange={() => { void changeMode(m) }} />
                      <span><b>{MODE_LABEL[m].title}</b><small>{MODE_LABEL[m].hint}</small></span>
                    </label>
                  ))}
                  {!isAdmin && <p className="cash-help">Solo el administrador cambia el modo de facturación.</p>}
                </fieldset>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

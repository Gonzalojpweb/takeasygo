import { useCallback, useEffect, useState } from "react"
import { Search, UserPlus, Gift } from "lucide-react"
import { useAuth } from "../../hooks/useAuth"
import { useLayout } from "../layout/LayoutContext"
import { formatCurrency } from "../../utils/format"
import {
  createCustomer,
  getCustomerOrders,
  searchCustomers,
  type CustomerOrder,
  type CustomerSearchResult,
} from "../../services/customers-api"
import { claimRedemption, lookupClubMember, type ClubLookup } from "../../services/club"
import { closeKeyboardOnEnter } from "../../utils/touch"

// ============================================================================
// Contexto Clientes (Fase 4, 29/10/2026) — caja, encargado y admin
// ============================================================================
// Ficha OPERATIVA (no CRM): buscar o crear al cliente en el momento, ver sus
// pedidos, y su club — puntos, nivel y canjes a entregar con el código que
// trae el cliente. Misma base de clientes que el resto del POS (Sync); el
// análisis y las campañas siguen en el panel web (CRM).
// ============================================================================

const TIER_LABEL: Record<string, string> = { bronze: "Bronce", silver: "Plata", gold: "Oro" }

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—")

export function ClientsDashboard() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined
  const { setContextPanel, setActionBar } = useLayout()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CustomerSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null)
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: "", phone: "", email: "" })
  const [clubPhone, setClubPhone] = useState("")
  const [club, setClub] = useState<ClubLookup | null>(null)
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)

  const flash = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text })
    setTimeout(() => setNotice(null), 4000)
  }, [])

  // Búsqueda con espera corta (nombre o celular).
  useEffect(() => {
    if (!jwt || query.trim().length < 2) { setResults(null); return }
    let alive = true
    const id = setTimeout(() => {
      setSearching(true)
      searchCustomers(query.trim(), jwt)
        .then((r) => { if (alive) setResults(r.customers) })
        .catch((err) => { if (alive) flash("error", errorText(err, "No se pudo buscar")) })
        .finally(() => { if (alive) setSearching(false) })
    }, 300)
    return () => { alive = false; clearTimeout(id) }
  }, [query, jwt, flash])

  const lookupClub = useCallback(async (phone: string) => {
    if (!tenantId) return
    setBusy(true)
    try {
      setClub(await lookupClubMember(tenantId, phone))
      setCodes({})
    } catch (err) {
      flash("error", errorText(err, "No se pudo consultar el club"))
    } finally {
      setBusy(false)
    }
  }, [tenantId, flash])

  const select = useCallback(async (c: CustomerSearchResult) => {
    setSelected(c)
    setCreating(false)
    setOrders(null)
    setClub(null)
    if (c.phone) {
      setClubPhone(c.phone)
      void lookupClub(c.phone)
    }
    if (!jwt) return
    try {
      setOrders((await getCustomerOrders(c.customerId, jwt, 1, 10)).orders)
    } catch {
      setOrders([]) // el historial puede no estar en el plan: no es un error para la caja
    }
  }, [jwt, lookupClub])

  const deliver = useCallback(async (id: string) => {
    if (!tenantId) return
    const code = (codes[id] ?? "").trim()
    if (!code) return flash("error", "Pedile al cliente el código del canje")
    setBusy(true)
    try {
      await claimRedemption(tenantId, id, code)
      flash("success", "Canje entregado")
      if (clubPhone) await lookupClub(clubPhone)
    } catch (err) {
      flash("error", errorText(err, "No se pudo entregar"))
    } finally {
      setBusy(false)
    }
  }, [tenantId, codes, clubPhone, lookupClub, flash])

  const submitNew = useCallback(async () => {
    if (!jwt) return
    if (form.name.trim().length < 2) return flash("error", "Escribí el nombre")
    setBusy(true)
    try {
      const created = await createCustomer({ name: form.name.trim(), phone: form.phone.trim() || undefined, email: form.email.trim() || undefined }, jwt)
      flash("success", "Cliente creado")
      setForm({ name: "", phone: "", email: "" })
      setCreating(false)
      void select({ customerId: created.customerId, name: created.name, phone: created.phone, email: created.email, totalOrders: 0, totalSpent: 0, lastOrderAt: null, isLoyaltyMember: false })
    } catch (err) {
      flash("error", errorText(err, "No se pudo crear el cliente"))
    } finally {
      setBusy(false)
    }
  }, [jwt, form, flash, select])

  useEffect(() => {
    if (creating) {
      setContextPanel({
        title: "Nuevo cliente",
        openOnMobile: true,
        body: (
          <div className="config-form">
            <label className="config-field"><span>Nombre</span><input id="client-name" className="search-input" value={form.name} maxLength={80} placeholder="Juan Pérez" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus /></label>
            <label className="config-field"><span>Celular</span><input id="client-phone" className="search-input" inputMode="tel" value={form.phone} placeholder="11 5555-1234" onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></label>
            <label className="config-field"><span>Email (opcional)</span><input id="client-email" className="search-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
            <p className="cash-help">Los datos se guardan cifrados. Para sumarlo al club, el cliente se registra con su celular.</p>
          </div>
        ),
      })
      setActionBar({
        left: <button className="btn btn-ghost" disabled={busy} onClick={() => setCreating(false)}>Cancelar</button>,
        right: <button className="btn btn-primary" disabled={busy} onClick={() => { void submitNew() }}>Crear cliente</button>,
      })
      return
    }
    if (selected) {
      setContextPanel({
        title: selected.name || "Cliente",
        subtitle: selected.isLoyaltyMember ? "Socio del club" : undefined,
        openOnMobile: true,
        body: (
          <dl className="cash-stats">
            {selected.phone && <div className="cash-stat"><dt>Celular</dt><dd>{selected.phone}</dd></div>}
            <div className="cash-stat"><dt>Pedidos</dt><dd>{selected.totalOrders}</dd></div>
            <div className="cash-stat"><dt>Gastó en total</dt><dd>{formatCurrency(selected.totalSpent)}</dd></div>
            <div className="cash-stat"><dt>Última visita</dt><dd>{fmtDate(selected.lastOrderAt)}</dd></div>
            {club?.member && <div className="cash-stat cash-stat-main"><dt>Puntos del club</dt><dd>{club.member.points}</dd></div>}
          </dl>
        ),
      })
      setActionBar({ left: <button className="btn btn-ghost" onClick={() => { setSelected(null); setOrders(null) }}>Volver</button> })
      return
    }
    setContextPanel({
      title: "Clientes",
      body: <p className="cash-help">Buscá por nombre o celular. En la ficha ves sus pedidos y, si es socio, sus puntos y los canjes para entregar.</p>,
    })
    setActionBar({ right: <button className="btn btn-primary" onClick={() => { setCreating(true); setSelected(null) }}><UserPlus size={16} aria-hidden /> Nuevo cliente</button> })
  }, [creating, selected, club, form, busy, setContextPanel, setActionBar, submitNew])

  return (
    <div className="workspace config">
      <div className="config-body">
        {notice && <div className={`config-notice ${notice.kind}`} role="status">{notice.text}</div>}

        <div className="config-section-head">
          <div>
            <h2>Clientes</h2>
            <p>Ficha para atender: pedidos, club y canjes</p>
          </div>
        </div>

        <label className="clients-search">
          <Search size={18} aria-hidden />
          <input id="clients-query" className="search-input" type="search" enterKeyHint="search" autoComplete="off" placeholder="Nombre o celular" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={closeKeyboardOnEnter} aria-label="Buscar cliente" />
        </label>

        {searching && <p className="cash-help">Buscando…</p>}
        {results && results.length === 0 && !searching && <p className="cash-help">Sin resultados. Podés crearlo con «Nuevo cliente».</p>}
        {results && results.length > 0 && (
          <div className="config-list">
            {results.map((c) => (
              <button key={c.customerId} type="button" className={`config-printer${selected?.customerId === c.customerId ? " selected" : ""}`} onClick={() => { void select(c) }}>
                <span className={`config-dot ${c.isLoyaltyMember ? "ok" : "unknown"}`} aria-hidden />
                <span className="config-printer-main">
                  <b>{c.name || "Sin nombre"}</b>
                  <small>{c.totalOrders} pedidos · última {fmtDate(c.lastOrderAt)}</small>
                </span>
                <span className="config-chips">{c.isLoyaltyMember && <span className="config-chip">Club</span>}</span>
              </button>
            ))}
          </div>
        )}

        {selected && orders && orders.length > 0 && (
          <>
            <h3 className="clients-subtitle">Últimos pedidos</h3>
            <div className="cash-history">
              {orders.map((o) => (
                <div key={o._id} className="cash-history-row">
                  <span className="cash-history-date">{fmtDate(o.createdAt)} <span className="sale-line-sub">· #{o.orderNumber} · {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ").slice(0, 80)}</span></span>
                  <span className="cash-history-total">{formatCurrency(o.total)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <section className="clients-club" aria-labelledby="club-title">
          <h3 id="club-title" className="clients-subtitle"><Gift size={18} aria-hidden /> Club</h3>
          <div className="clients-club-search">
            <input id="club-phone" className="search-input" inputMode="tel" enterKeyHint="search" autoComplete="off" placeholder="Celular del socio" value={clubPhone} onChange={(e) => setClubPhone(e.target.value)} onKeyDown={(e) => { if (e.key !== "Enter") return; void lookupClub(clubPhone); closeKeyboardOnEnter(e) }} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy || clubPhone.replace(/\D/g, "").length < 8} onClick={() => { void lookupClub(clubPhone) }}>Buscar socio</button>
          </div>
          {club && !club.member && <p className="cash-help">Ese celular no es socio del club en esta sede.</p>}
          {club?.member && (
            <div className="clients-member">
              <div><b>{club.member.name}</b> <small>{club.member.tier && club.member.tier !== "none" ? `Nivel ${TIER_LABEL[club.member.tier] ?? club.member.tier}` : ""}</small></div>
              <strong>{club.member.points} puntos</strong>
            </div>
          )}
          {club?.member && club.redemptions.length === 0 && <p className="cash-help">No tiene canjes para entregar.</p>}
          {club?.redemptions.map((r) => (
            <div key={r.id} className="clients-redemption">
              <span><b>{r.item}</b> <small>{r.pointsUsed} pts{r.expiresAt ? ` · vence ${fmtDate(r.expiresAt)}` : ""}</small></span>
              <input className="search-input" aria-label={`Código del canje ${r.item}`} placeholder="Código" value={codes[r.id] ?? ""} onChange={(e) => setCodes((c) => ({ ...c, [r.id]: e.target.value.toUpperCase() }))} />
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => { void deliver(r.id) }}>Entregar</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

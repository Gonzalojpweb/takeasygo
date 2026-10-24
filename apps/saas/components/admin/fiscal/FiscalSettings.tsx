'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2,
  Circle,
  Download,
  FileKey2,
  Loader2,
  PlugZap,
  Receipt,
  Save,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { IVA_RATES, ISSUER_IVA_CONDITION_LABELS, formatCuit, type IssuerIvaCondition } from '@takeasygo/business/browser'

// ============================================================================
// Factura electrónica (ARCA) — datos fiscales, puntos de venta, conexión e IVA
// ============================================================================
// Fases 3 y 4 de caja (2026-10). Docs: ADMIN/FASE3_DATOS_FISCALES_E_IVA.md y
// ADMIN/FASE4_ARCA_FACTURA_ELECTRONICA.md. Una sola página con los pasos en
// orden; el checklist de arriba dice qué falta. Textos sin tecnicismos.
// ============================================================================

interface Profile {
  enabled: boolean
  cuit: string
  legalName: string
  ivaCondition: IssuerIvaCondition | null
  grossIncomeNumber: string
  activityStartDate: string | null
  fiscalAddress: string
  defaultIvaRate: number
  environment: 'homologation' | 'production'
  invoicingMode: 'ask' | 'always' | 'off'
  onlineInvoicing: 'off' | 'auto'
  pointsOfSale: { locationId: string; number: number }[]
  contingency: { enabled: boolean; pointsOfSale: { locationId: string; number: number }[] }
  connection: { checkedAt: string | null; ok: boolean; environment: string | null; message: string }
  credentials: {
    hasCsr: boolean
    csr: string
    csrCreatedAt: string | null
    hasCertificate: boolean
    certificateSubject: string
    certificateExpiresAt: string | null
  }
}

interface Readiness {
  ready: boolean
  steps: { step: string; ok: boolean; detail: string }[]
}

interface MenuData {
  id: string
  locationId: string
  categories: { id: string; name: string; ivaRate: number | null; items: { id: string; name: string; ivaRate: number | null }[] }[]
}

const STEP_LABELS: Record<string, string> = {
  data: 'Datos fiscales',
  pointOfSale: 'Punto de venta por sede',
  certificate: 'Certificado de ARCA',
  connection: 'Prueba de conexión',
}

const card = 'rounded-[2rem] border-2 border-border/60 bg-card p-6'
const input =
  'min-h-11 w-full rounded-2xl border-2 border-border/60 bg-background px-4 text-sm font-semibold outline-none focus:border-primary'
const label = 'text-xs font-black uppercase tracking-widest text-muted-foreground'
const primaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-black text-primary-foreground disabled:opacity-50'
const ghostBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-border/60 px-4 text-sm font-bold hover:bg-muted disabled:opacity-50'

function rateLabel(rate: number | null, fallback: string): string {
  if (rate === null) return fallback
  return IVA_RATES.find((r) => r.pct === rate)?.label ?? `${rate} %`
}

export default function FiscalSettings({ tenantSlug }: { tenantSlug: string }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [menus, setMenus] = useState<MenuData[]>([])
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [certificatePem, setCertificatePem] = useState('')
  const [menuLocation, setMenuLocation] = useState<string>('')
  const [rateDraft, setRateDraft] = useState<{ categories: Record<string, number | null>; items: Record<string, number | null> }>({
    categories: {},
    items: {},
  })
  const [openCategory, setOpenCategory] = useState<string | null>(null)

  const api = `/api/${tenantSlug}/admin/fiscal`

  const load = useCallback(async () => {
    const res = await fetch(api, { cache: 'no-store' })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? 'No se pudieron cargar los datos')
    setProfile(body.profile)
    setReadiness(body.readiness)
    setLocations(body.locations)
    setMenus(body.menus)
    setMenuLocation((prev) => prev || body.locations[0]?.id || '')
  }, [api])

  useEffect(() => {
    load().catch((e) => toast.error(e.message))
  }, [load])

  const menu = useMemo(() => menus.find((m) => m.locationId === menuLocation) ?? null, [menus, menuLocation])

  if (!profile || !readiness) {
    return (
      <div className="flex items-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="animate-spin" size={18} /> Cargando facturación…
      </div>
    )
  }

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((p) => (p ? { ...p, [key]: value } : p))
  const posFor = (locationId: string) => profile.pointsOfSale.find((p) => p.locationId === locationId)?.number ?? ''

  const saveProfile = async (enabled = profile.enabled) => {
    setSaving(true)
    try {
      const res = await fetch(api, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuit: profile.cuit,
          legalName: profile.legalName,
          ivaCondition: profile.ivaCondition,
          grossIncomeNumber: profile.grossIncomeNumber,
          activityStartDate: profile.activityStartDate,
          fiscalAddress: profile.fiscalAddress,
          defaultIvaRate: profile.defaultIvaRate,
          invoicingMode: profile.invoicingMode,
          onlineInvoicing: profile.onlineInvoicing,
          environment: profile.environment,
          pointsOfSale: profile.pointsOfSale.filter((p) => p.number > 0),
          contingency: {
            enabled: profile.contingency.enabled,
            pointsOfSale: profile.contingency.pointsOfSale.filter((p) => p.number > 0),
          },
          enabled,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        if (body.readiness) setReadiness(body.readiness)
        throw new Error(body.error ?? 'No se pudo guardar')
      }
      setProfile(body.profile)
      setReadiness(body.readiness)
      toast.success(enabled ? 'Facturación activa' : 'Datos guardados')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Algo salió mal')
    } finally {
      setBusy(null)
    }
  }

  const generateCsr = () =>
    run('csr', async () => {
      const res = await fetch(`${api}/csr`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo generar el pedido')
      await load()
      toast.success('Pedido de certificado generado. Descargalo y subilo a ARCA.')
    })

  const downloadCsr = () => {
    const blob = new Blob([profile.credentials.csr], { type: 'application/pkcs10' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pedido-certificado-${profile.cuit || 'comercio'}.csr`
    a.click()
    URL.revokeObjectURL(url)
  }

  const uploadCertificate = () =>
    run('cert', async () => {
      const res = await fetch(`${api}/certificate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificate: certificatePem }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar el certificado')
      setCertificatePem('')
      await load()
      toast.success('Certificado cargado')
    })

  const testConnection = () =>
    run('test', async () => {
      const res = await fetch(`${api}/test`, { method: 'POST' })
      const body = await res.json()
      await load()
      if (!res.ok || !body.ok) throw new Error(body.error ?? body.message ?? 'ARCA no respondió')
      toast.success(body.message ?? 'Conexión con ARCA OK')
    })

  const saveRates = () =>
    run('rates', async () => {
      if (!menu) return
      const res = await fetch(`${api}/iva-rates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuId: menu.id,
          categories: Object.entries(rateDraft.categories).map(([id, ivaRate]) => ({ id, ivaRate })),
          items: Object.entries(rateDraft.items).map(([id, ivaRate]) => ({ id, ivaRate })),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudieron guardar las alícuotas')
      setRateDraft({ categories: {}, items: {} })
      await load()
      toast.success('Alícuotas guardadas')
    })

  const pendingRates = Object.keys(rateDraft.categories).length + Object.keys(rateDraft.items).length
  const generalLabel = `General (${rateLabel(profile.defaultIvaRate, '21 %')})`
  const isMono = profile.ivaCondition === 'monotributo' || profile.ivaCondition === 'exento'

  return (
    <div className="space-y-6 pb-16">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">Factura electrónica</h1>
        <p className="mt-2 max-w-3xl font-medium text-muted-foreground">
          Factura electrónica de ARCA desde el POS: al cobrar, el sistema pide el CAE y el ticket sale con el QR fiscal.
          Seguí los pasos en orden. Ante cualquier duda fiscal, consultá con tu contador.
        </p>
      </header>

      {/* ── Estado ─────────────────────────────────────────────── */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-black">
              <Receipt size={20} /> {profile.enabled ? 'Facturación activa' : 'Facturación apagada'}
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-black ${
                  profile.environment === 'production' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {profile.environment === 'production' ? 'Producción' : 'Pruebas (homologación)'}
              </span>
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {readiness.steps.map((s) => (
                <li key={s.step} className="flex items-start gap-2 text-sm">
                  {s.ok ? (
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                  )}
                  <span>
                    <span className="font-bold">{STEP_LABELS[s.step] ?? s.step}</span>
                    <span className="block text-muted-foreground">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            className={profile.enabled ? ghostBtn : primaryBtn}
            disabled={saving || (!profile.enabled && !readiness.ready)}
            onClick={() => saveProfile(!profile.enabled)}
            title={!readiness.ready && !profile.enabled ? 'Completá los pasos primero' : undefined}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {profile.enabled ? 'Apagar facturación' : 'Activar facturación'}
          </button>
        </div>
      </section>

      {/* ── 1. Datos fiscales ──────────────────────────────────── */}
      <section className={card}>
        <h2 className="text-lg font-black">1. Datos del comercio</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tal como figuran en ARCA. Salen impresos en cada comprobante.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className={label}>CUIT</span>
            <input
              className={input}
              inputMode="numeric"
              placeholder="20-12345678-6"
              value={formatCuit(profile.cuit)}
              onChange={(e) => set('cuit', e.target.value.replace(/\D/g, '').slice(0, 11))}
            />
          </label>
          <label className="space-y-1.5">
            <span className={label}>Razón social</span>
            <input className={input} value={profile.legalName} maxLength={120} onChange={(e) => set('legalName', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className={label}>Condición frente al IVA</span>
            <select
              className={input}
              value={profile.ivaCondition ?? ''}
              onChange={(e) => set('ivaCondition', (e.target.value || null) as IssuerIvaCondition | null)}
            >
              <option value="">Elegí…</option>
              {Object.entries(ISSUER_IVA_CONDITION_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
            <span className="block text-xs text-muted-foreground">
              {profile.ivaCondition === 'responsable_inscripto'
                ? 'Emitís Factura A (a otros inscriptos y monotributistas) y B (consumidor final).'
                : isMono
                  ? 'Emitís Factura C: no se discrimina IVA.'
                  : 'Define qué tipo de factura emitís.'}
            </span>
          </label>
          <label className="space-y-1.5">
            <span className={label}>Ingresos brutos (opcional)</span>
            <input
              className={input}
              value={profile.grossIncomeNumber}
              maxLength={40}
              onChange={(e) => set('grossIncomeNumber', e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className={label}>Inicio de actividades</span>
            <input
              className={input}
              type="date"
              value={profile.activityStartDate ?? ''}
              onChange={(e) => set('activityStartDate', e.target.value || null)}
            />
          </label>
          <label className="space-y-1.5">
            <span className={label}>Domicilio fiscal</span>
            <input
              className={input}
              value={profile.fiscalAddress}
              maxLength={200}
              onChange={(e) => set('fiscalAddress', e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* ── 2. Puntos de venta ─────────────────────────────────── */}
      <section className={card}>
        <h2 className="text-lg font-black">2. Punto de venta de cada sede</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          En ARCA → «Administración de puntos de venta y domicilios», creá un punto de venta del tipo{' '}
          <strong>«Factura electrónica — Web Services»</strong> para cada sede y anotá su número acá. El de «Factura en línea» no
          sirve.
        </p>
        <div className="mt-4 space-y-2">
          {locations.map((l) => (
            <label key={l.id} className="flex items-center justify-between gap-4 rounded-2xl bg-muted/30 px-4 py-2">
              <span className="font-bold">{l.name}</span>
              <input
                className={`${input} max-w-[140px] text-center`}
                inputMode="numeric"
                placeholder="Ej: 3"
                value={posFor(l.id)}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value.replace(/\D/g, '').slice(0, 5), 10)
                  setProfile((p) =>
                    p
                      ? {
                          ...p,
                          pointsOfSale: [
                            ...p.pointsOfSale.filter((x) => x.locationId !== l.id),
                            ...(Number.isFinite(n) && n > 0 ? [{ locationId: l.id, number: n }] : []),
                          ],
                        }
                      : p
                  )
                }}
              />
            </label>
          ))}
        </div>
      </section>

      {/* ── 2b. Contingencia CAEA (Fase 6) ─────────────────────── */}
      <section className={card}>
        <h2 className="text-lg font-black">Si ARCA no responde (contingencia)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Opcional. TakeasyGO pide a ARCA por adelantado un código por quincena (CAEA). Si ARCA no responde al facturar, la
          factura sale igual con ese código, en un punto de venta exclusivo de contingencia, y se informa sola cuando vuelve
          la conexión. Creá en ARCA un punto de venta más por sede, del tipo <strong>«Factura electrónica — Web Services
          (CAEA)»</strong>, y anotá su número. Tiene que ser distinto del de arriba. Sin contingencia, las facturas esperan a
          que ARCA vuelva.
        </p>
        <label className="mt-4 flex items-center gap-3 font-bold">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={profile.contingency.enabled}
            onChange={(e) => set('contingency', { ...profile.contingency, enabled: e.target.checked })}
          />
          Usar contingencia CAEA
        </label>
        {profile.contingency.enabled && (
          <div className="mt-3 space-y-2">
            {locations.map((l) => (
              <label key={l.id} className="flex items-center justify-between gap-4 rounded-2xl bg-muted/30 px-4 py-2">
                <span className="font-bold">{l.name} · contingencia</span>
                <input
                  className={`${input} max-w-[140px] text-center`}
                  inputMode="numeric"
                  placeholder="Ej: 13"
                  value={profile.contingency.pointsOfSale.find((p) => p.locationId === l.id)?.number ?? ''}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value.replace(/\D/g, '').slice(0, 5), 10)
                    set('contingency', {
                      ...profile.contingency,
                      pointsOfSale: [
                        ...profile.contingency.pointsOfSale.filter((x) => x.locationId !== l.id),
                        ...(Number.isFinite(n) && n > 0 ? [{ locationId: l.id, number: n }] : []),
                      ],
                    })
                  }}
                />
              </label>
            ))}
          </div>
        )}
      </section>

      {/* ── 3. POS ─────────────────────────────────────────────── */}
      <section className={card}>
        <h2 className="text-lg font-black">3. Cómo factura el POS al cobrar</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-3" role="radiogroup">
          {(
            [
              ['ask', 'Preguntar en cada cobro', 'El cajero elige «Con factura» o «Sin factura». Recomendado para empezar.'],
              ['always', 'Siempre facturar', 'Cada cobro sale con factura. A consumidor final por defecto.'],
              ['off', 'No facturar desde el POS', 'La facturación queda apagada en la caja.'],
            ] as const
          ).map(([value, title, desc]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={profile.invoicingMode === value}
              onClick={() => set('invoicingMode', value)}
              className={`rounded-2xl border-2 p-4 text-left ${
                profile.invoicingMode === value ? 'border-primary bg-primary/5' : 'border-border/60 hover:bg-muted/40'
              }`}
            >
              <div className="font-black">{title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
            </button>
          ))}
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-border/60 p-4">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={profile.onlineInvoicing === 'auto'}
            onChange={(e) => set('onlineInvoicing', e.target.checked ? 'auto' : 'off')}
          />
          <span>
            <span className="font-black">Facturar pedidos online automáticamente</span>
            <span className="block text-xs text-muted-foreground">
              Delivery, take away y pedidos por QR: Factura a consumidor final apenas se aprueba el pago online, o al entregar si
              pagan en efectivo. Sale impresa en la caja para ir con el pedido. Si se cancela, sale la nota de crédito. Una
              factura con CUIT se hace desde «Comprobantes → Facturar un pedido».
            </span>
          </span>
        </label>
        <div className="mt-5 flex justify-end">
          <button type="button" className={primaryBtn} disabled={saving} onClick={() => saveProfile()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar datos
          </button>
        </div>
      </section>

      {/* ── 4. Conexión con ARCA ───────────────────────────────── */}
      <section className={card}>
        <h2 className="text-lg font-black">4. Conexión con ARCA</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ARCA pide un certificado digital para autorizar las facturas. La clave privada se genera y queda guardada cifrada en
          TakeasyGO: nunca sale del servidor ni la tenés que manejar vos.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={label}>Ambiente</span>
          {(['homologation', 'production'] as const).map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => set('environment', env)}
              className={`min-h-11 rounded-2xl border-2 px-4 text-sm font-bold ${
                profile.environment === env ? 'border-primary bg-primary/5' : 'border-border/60'
              }`}
            >
              {env === 'production' ? 'Producción (facturas reales)' : 'Pruebas (homologación)'}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">Cambiar de ambiente pide un certificado de ese ambiente y guardar.</span>
        </div>

        <ol className="mt-5 space-y-4">
          <li className="rounded-2xl bg-muted/30 p-4">
            <div className="font-black">a. Generá el pedido de certificado</div>
            <p className="mt-1 text-sm text-muted-foreground">Necesita el CUIT y la razón social guardados.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={ghostBtn} disabled={busy === 'csr'} onClick={generateCsr}>
                {busy === 'csr' ? <Loader2 size={16} className="animate-spin" /> : <FileKey2 size={16} />}
                {profile.credentials.hasCsr ? 'Generar uno nuevo' : 'Generar pedido'}
              </button>
              {profile.credentials.hasCsr && (
                <button type="button" className={ghostBtn} onClick={downloadCsr}>
                  <Download size={16} /> Descargar .csr
                </button>
              )}
            </div>
          </li>
          <li className="rounded-2xl bg-muted/30 p-4">
            <div className="font-black">b. Subilo a ARCA y descargá el certificado</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Entrá con clave fiscal a <strong>«Administración de certificados digitales»</strong> (en pruebas:{' '}
              <strong>«WSASS — Autogestión certificados homologación»</strong>), creá un certificado nuevo pegando el pedido y
              descargá el archivo <code>.crt</code>. Después, en <strong>«Administrador de relaciones de clave fiscal»</strong>,
              asociá ese certificado al servicio <strong>«Facturación electrónica» (wsfe)</strong>.
            </p>
          </li>
          <li className="rounded-2xl bg-muted/30 p-4">
            <div className="font-black">c. Cargá el certificado</div>
            {profile.credentials.hasCertificate && (
              <p className="mt-1 text-sm text-emerald-700">
                Cargado: {profile.credentials.certificateSubject || 'certificado'}
                {profile.credentials.certificateExpiresAt
                  ? ` · vence ${new Date(profile.credentials.certificateExpiresAt).toLocaleDateString('es-AR')}`
                  : ''}
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              <label className={`${ghostBtn} w-fit cursor-pointer`}>
                <Upload size={16} /> Elegir archivo .crt
                <input
                  type="file"
                  accept=".crt,.pem,.cer"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) setCertificatePem(await file.text())
                  }}
                />
              </label>
              <textarea
                className={`${input} min-h-28 py-3 font-mono text-xs`}
                placeholder="…o pegá el contenido (-----BEGIN CERTIFICATE----- …)"
                value={certificatePem}
                onChange={(e) => setCertificatePem(e.target.value)}
              />
              <button
                type="button"
                className={`${primaryBtn} w-fit`}
                disabled={!certificatePem.includes('BEGIN CERTIFICATE') || busy === 'cert'}
                onClick={uploadCertificate}
              >
                {busy === 'cert' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Cargar certificado
              </button>
            </div>
          </li>
          <li className="rounded-2xl bg-muted/30 p-4">
            <div className="font-black">d. Probá la conexión</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Pide autorización a ARCA y consulta el último comprobante de cada punto de venta. No emite nada.
            </p>
            {profile.connection.checkedAt && (
              <p className={`mt-2 text-sm ${profile.connection.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {profile.connection.ok ? 'OK' : 'Error'} · {new Date(profile.connection.checkedAt).toLocaleString('es-AR')} ·{' '}
                {profile.connection.message}
              </p>
            )}
            <button
              type="button"
              className={`${ghostBtn} mt-3`}
              disabled={!profile.credentials.hasCertificate || busy === 'test'}
              onClick={testConnection}
            >
              {busy === 'test' ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />} Probar conexión
            </button>
          </li>
        </ol>
      </section>

      {/* ── 5. IVA de la carta ─────────────────────────────────── */}
      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">5. IVA de la carta</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Los precios se cargan con IVA incluido. Elegí la alícuota general y cambiá solo las categorías o productos que
              tengan otra. {isMono ? 'Como monotributista no discriminás IVA: esto queda listo por si cambiás de condición.' : ''}
            </p>
          </div>
          <label className="space-y-1.5">
            <span className={label}>Alícuota general</span>
            <select
              className={input}
              value={profile.defaultIvaRate}
              onChange={(e) => set('defaultIvaRate', Number(e.target.value))}
            >
              {IVA_RATES.map((r) => (
                <option key={r.pct} value={r.pct}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {locations.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {locations.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setMenuLocation(l.id)
                  setRateDraft({ categories: {}, items: {} })
                }}
                className={`min-h-11 rounded-2xl border-2 px-4 text-sm font-bold ${
                  menuLocation === l.id ? 'border-primary bg-primary/5' : 'border-border/60'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}

        {!menu ? (
          <p className="mt-4 text-sm text-muted-foreground">Esta sede todavía no tiene carta.</p>
        ) : (
          <div className="mt-4 divide-y divide-border/60 rounded-2xl border-2 border-border/60">
            {menu.categories.map((c) => {
              const catRate = c.id in rateDraft.categories ? rateDraft.categories[c.id] : c.ivaRate
              const overrides = c.items.filter((i) => (i.id in rateDraft.items ? rateDraft.items[i.id] : i.ivaRate) !== null).length
              return (
                <div key={c.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      className="text-left font-bold"
                      onClick={() => setOpenCategory(openCategory === c.id ? null : c.id)}
                      aria-expanded={openCategory === c.id}
                    >
                      {c.name}
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        {c.items.length} productos{overrides > 0 ? ` · ${overrides} con alícuota propia` : ''}
                      </span>
                    </button>
                    <select
                      className={`${input} max-w-[220px]`}
                      value={catRate === null ? '' : String(catRate)}
                      onChange={(e) =>
                        setRateDraft((d) => ({
                          ...d,
                          categories: { ...d.categories, [c.id]: e.target.value === '' ? null : Number(e.target.value) },
                        }))
                      }
                    >
                      <option value="">{generalLabel}</option>
                      {IVA_RATES.map((r) => (
                        <option key={r.pct} value={r.pct}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {openCategory === c.id && (
                    <div className="mt-3 space-y-1 pl-3">
                      {c.items.map((i) => {
                        const itemRate = i.id in rateDraft.items ? rateDraft.items[i.id] : i.ivaRate
                        return (
                          <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
                            <span>{i.name}</span>
                            <select
                              className={`${input} max-w-[220px]`}
                              value={itemRate === null ? '' : String(itemRate)}
                              onChange={(e) =>
                                setRateDraft((d) => ({
                                  ...d,
                                  items: { ...d.items, [i.id]: e.target.value === '' ? null : Number(e.target.value) },
                                }))
                              }
                            >
                              <option value="">Igual que la categoría</option>
                              {IVA_RATES.map((r) => (
                                <option key={r.pct} value={r.pct}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className={ghostBtn} disabled={saving} onClick={() => saveProfile()}>
            Guardar alícuota general
          </button>
          <button type="button" className={primaryBtn} disabled={pendingRates === 0 || busy === 'rates'} onClick={saveRates}>
            {busy === 'rates' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar alícuotas{pendingRates > 0 ? ` (${pendingRates})` : ''}
          </button>
        </div>
      </section>
    </div>
  )
}

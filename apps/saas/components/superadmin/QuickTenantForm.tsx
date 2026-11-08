'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Camera, Check, Copy, ExternalLink, ImagePlus, Images, Loader2, MessageCircle, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLAN_LABELS, PLAN_PRICE, type Plan } from '@/lib/plans'
import { slugifyOrFallback } from '@/lib/slugify'
import { RUBRO_TEMPLATES, getRubroTemplate } from '@/lib/provisioning/templates'
import { parseMenuJson, MENU_JSON_PROMPT } from '@/lib/provisioning/menu-json'

const PLANS: Plan[] = ['trial', 'anfitrion', 'try', 'buy', 'full', 'high'] as Plan[]

interface Props {
  tenants: Array<{ id: string; name: string; slug: string }>
  organizations: Array<{ id: string; name: string }>
}

type MenuSource = 'template' | 'json' | 'clone' | 'empty'
type OrgMode = 'none' | 'existing' | 'new'

interface Result {
  reused: boolean
  tenant: { id: string; name: string; slug: string; plan: string }
  locations: Array<{ id: string; name: string; slug: string }>
  owner: { id: string | null; email: string; existingAccount: boolean }
  invite: { url: string; expiresAt: string; whatsappUrl: string } | null
  emailSent: boolean
  menuItems: number
  warnings: string[]
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** Colores dominantes del logo (en el navegador, sin IA): descarta blancos, negros y transparentes. */
async function paletteFromImage(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)
    const counts = new Map<string, number>()
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
      if (a < 200) continue
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      if (max > 235 && min > 225) continue // blanco
      if (max < 28) continue // negro
      const key = [r, g, b].map(v => Math.min(255, Math.round(v / 24) * 24)).join(',')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const hex = (k: string) => '#' + k.split(',').map(v => Number(v).toString(16).padStart(2, '0')).join('')
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    const picked: string[] = []
    for (const k of sorted) {
      const [r, g, b] = k.split(',').map(Number)
      if (picked.every(p => { const [pr, pg, pb] = p.split(',').map(Number); return Math.abs(pr - r) + Math.abs(pg - g) + Math.abs(pb - b) > 90 })) picked.push(k)
      if (picked.length === 4) break
    }
    return picked.map(hex)
  } catch {
    return []
  } finally {
    URL.revokeObjectURL(url)
  }
}

const field = 'w-full min-h-11 rounded-xl border border-border bg-background px-3 text-[15px] text-foreground outline-none focus:border-primary'
const label = 'mb-1.5 block text-xs font-bold text-muted-foreground'
const card = 'rounded-2xl border border-border bg-card p-4 space-y-4'

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div className="grid gap-1.5 rounded-xl bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('min-h-10 rounded-lg px-2 text-[13px] font-bold transition-colors', value === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function QuickTenantForm({ tenants, organizations }: Props) {
  const [idempotencyKey, setIdempotencyKey] = useState(newKey)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [rubro, setRubro] = useState('restaurante')
  const [plan, setPlan] = useState<Plan>('trial' as Plan)
  const [owner, setOwner] = useState({ name: '', email: '', phone: '' })
  const [locations, setLocations] = useState([{ name: '', address: '', phone: '' }])
  const [primaryColor, setPrimaryColor] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [palette, setPalette] = useState<string[]>([])
  const [menuSource, setMenuSource] = useState<MenuSource>('template')
  const [menuJson, setMenuJson] = useState('')
  const [clone, setClone] = useState({ tenantId: '', menu: 'with_prices' as 'with_prices' | 'without_prices' | 'none', schedules: true, orderModes: true })
  const [cloneSettings, setCloneSettings] = useState(false)
  const [orgMode, setOrgMode] = useState<OrgMode>('none')
  const [orgId, setOrgId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  // Dos entradas: galería (sin capture) y cámara (capture). Con capture el celular
  // abre solo la cámara y no deja elegir un archivo ya guardado.
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const template = getRubroTemplate(rubro)
  const color = primaryColor ?? template.primaryColor
  const slugPreview = slug.trim() ? slugifyOrFallback(name, slug) : slugifyOrFallback(name || 'tu-comercio', '')
  const jsonCheck = useMemo(() => (menuSource === 'json' && menuJson.trim() ? parseMenuJson(menuJson) : null), [menuSource, menuJson])
  const usesClone = menuSource === 'clone' || cloneSettings

  const ready =
    name.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(owner.email) &&
    locations.every(l => l.address.trim().length >= 5) &&
    (menuSource !== 'json' || jsonCheck?.ok === true) &&
    (!usesClone || Boolean(clone.tenantId)) &&
    (orgMode !== 'existing' || Boolean(orgId)) &&
    (orgMode !== 'new' || orgName.trim().length >= 2)

  async function onLogo(file: File | null) {
    setLogoFile(file)
    setPalette([])
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoPreview(file ? URL.createObjectURL(file) : null)
    if (file) {
      const colors = await paletteFromImage(file)
      setPalette(colors)
      if (colors[0]) setPrimaryColor(colors[0])
    }
  }

  async function submit() {
    if (!ready || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const body = {
        idempotencyKey,
        name: name.trim(),
        slug: slug.trim(),
        plan,
        rubro,
        owner: { name: owner.name.trim(), email: owner.email.trim(), phone: owner.phone.trim() },
        locations: locations.map(l => ({ name: l.name.trim(), address: l.address.trim(), phone: l.phone.trim() })),
        branding: { primaryColor: color },
        menu: menuSource === 'json' ? { source: 'json', json: menuJson } : { source: menuSource },
        ...(usesClone ? { clone: { tenantId: clone.tenantId, menu: menuSource === 'clone' ? clone.menu : 'none', schedules: clone.schedules, orderModes: clone.orderModes } } : {}),
        organization: orgMode === 'existing' ? { mode: 'existing', orgId } : orgMode === 'new' ? { mode: 'new', name: orgName.trim() } : { mode: 'none' },
        sendEmail,
      }
      const res = await fetch('/api/superadmin/tenants/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el comercio')
      const created = data as Result

      // Logo: se sube al comercio ya creado (la subida necesita su carpeta).
      if (logoFile && !created.reused) {
        try {
          const form = new FormData()
          form.append('file', logoFile)
          const up = await fetch(`/api/${created.tenant.slug}/upload`, { method: 'POST', body: form })
          const upData = await up.json().catch(() => ({}))
          if (!up.ok || !upData.url) throw new Error()
          const br = await fetch(`/api/${created.tenant.slug}/settings/branding`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branding: { logoUrl: upData.url } }) })
          if (!br.ok) throw new Error()
        } catch {
          created.warnings = [...created.warnings, 'El comercio se creó, pero no se pudo subir el logo. Cargalo desde Configuración › Identidad.']
        }
      }
      setResult(created)
      toast.success(created.reused ? 'Ese comercio ya estaba creado' : `${created.tenant.name} creado`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el comercio')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setIdempotencyKey(newKey())
    setName(''); setSlug(''); setOwner({ name: '', email: '', phone: '' }); setLocations([{ name: '', address: '', phone: '' }])
    setPrimaryColor(null); void onLogo(null); setMenuSource('template'); setMenuJson(''); setCloneSettings(false)
    setClone({ tenantId: '', menu: 'with_prices', schedules: true, orderModes: true }); setOrgMode('none'); setOrgId(''); setOrgName('')
    setResult(null); setError(null)
  }

  if (result) return <ResultView result={result} onNew={reset} />

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 pb-28">
      {/* Comercio */}
      <section className={card} aria-labelledby="qt-comercio">
        <h2 id="qt-comercio" className="text-base font-extrabold">Comercio</h2>
        <div>
          <label className={label} htmlFor="qt-name">Nombre del comercio *</label>
          <input id="qt-name" className={field} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Pizza Crash" autoComplete="off" />
        </div>
        <div>
          <label className={label} htmlFor="qt-slug">Enlace (opcional)</label>
          <input id="qt-slug" className={field} value={slug} onChange={e => setSlug(e.target.value)} placeholder={slugifyOrFallback(name || 'pizza-crash', '')} autoComplete="off" />
          <p className="mt-1 text-xs text-muted-foreground">takeasygo.com/<b>{slugPreview}</b>/menu{!slug.trim() && ' · si está usado se agrega un número'}</p>
        </div>
        <div>
          <label className={label} htmlFor="qt-rubro">Rubro</label>
          <select id="qt-rubro" className={field} value={rubro} onChange={e => { setRubro(e.target.value); if (!logoFile) setPrimaryColor(null) }}>
            {RUBRO_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">Arranca con: {template.categories.join(', ')} · {template.hoursText}</p>
        </div>
        <div>
          <span className={label}>Plan</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PLANS.map(p => (
              <button key={p} type="button" onClick={() => setPlan(p)} aria-pressed={plan === p}
                className={cn('rounded-xl border px-3 py-2 text-left transition-colors', plan === p ? 'border-primary bg-primary/10' : 'border-border')}>
                <span className="block text-sm font-bold">{PLAN_LABELS[p]}</span>
                <span className="block text-[11px] text-muted-foreground">{PLAN_PRICE[p]}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Dueño */}
      <section className={card} aria-labelledby="qt-owner">
        <h2 id="qt-owner" className="text-base font-extrabold">Dueño</h2>
        <p className="-mt-2 text-xs text-muted-foreground">Recibe un link de un solo uso para definir su contraseña. Nadie más la conoce.</p>
        <div>
          <label className={label} htmlFor="qt-oemail">Email *</label>
          <input id="qt-oemail" type="email" inputMode="email" className={field} value={owner.email} onChange={e => setOwner({ ...owner, email: e.target.value })} placeholder="dueno@comercio.com" autoComplete="off" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="qt-oname">Nombre</label>
            <input id="qt-oname" className={field} value={owner.name} onChange={e => setOwner({ ...owner, name: e.target.value })} placeholder="Nombre y apellido" />
          </div>
          <div>
            <label className={label} htmlFor="qt-ophone">WhatsApp</label>
            <input id="qt-ophone" type="tel" inputMode="tel" className={field} value={owner.phone} onChange={e => setOwner({ ...owner, phone: e.target.value })} placeholder="11 6001 9734" />
          </div>
        </div>
      </section>

      {/* Sedes */}
      <section className={card} aria-labelledby="qt-sedes">
        <div className="flex items-center justify-between">
          <h2 id="qt-sedes" className="text-base font-extrabold">Sedes</h2>
          <span className="text-xs text-muted-foreground">{locations.length} de 10</span>
        </div>
        {locations.map((l, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{i === 0 ? 'Sede principal' : `Sede ${i + 1}`}</span>
              {locations.length > 1 && (
                <button type="button" onClick={() => setLocations(locations.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:text-destructive" aria-label={`Quitar sede ${i + 1}`}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <input className={field} value={l.address} onChange={e => setLocations(locations.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))} placeholder="Dirección * (Av. Corrientes 1234, CABA)" aria-label={`Dirección de la sede ${i + 1}`} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={field} value={l.name} onChange={e => setLocations(locations.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={i === 0 ? 'Nombre (Sede Principal)' : 'Nombre de la sede'} aria-label={`Nombre de la sede ${i + 1}`} />
              <input className={field} type="tel" value={l.phone} onChange={e => setLocations(locations.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder="Teléfono (opcional)" aria-label={`Teléfono de la sede ${i + 1}`} />
            </div>
          </div>
        ))}
        {locations.length < 10 && (
          <button type="button" onClick={() => setLocations([...locations, { name: '', address: '', phone: '' }])} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-primary">
            <Plus size={16} /> Agregar otra sede
          </button>
        )}
      </section>

      {/* Identidad */}
      <section className={card} aria-labelledby="qt-identidad">
        <h2 id="qt-identidad" className="text-base font-extrabold">Identidad</h2>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => galleryRef.current?.click()} className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted" aria-label="Elegir logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local del archivo */}
            {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-contain" /> : <ImagePlus size={22} className="text-muted-foreground" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{logoFile ? logoFile.name : 'Logo (opcional)'}</p>
            <p className="text-xs text-muted-foreground">Subilo desde la galería o sacale una foto. Tomamos sus colores.</p>
            {logoFile && <button type="button" onClick={() => onLogo(null)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground"><X size={12} /> Quitar</button>}
          </div>
          <input ref={galleryRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { void onLogo(e.target.files?.[0] ?? null); e.target.value = '' }} />
          <input ref={cameraRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" className="hidden" onChange={e => { void onLogo(e.target.files?.[0] ?? null); e.target.value = '' }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => galleryRef.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold">
            <Images size={17} /> Subir desde la galería
          </button>
          <button type="button" onClick={() => cameraRef.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold">
            <Camera size={17} /> Sacar foto
          </button>
        </div>
        <div>
          <span className={label}>Color principal</span>
          <div className="flex flex-wrap items-center gap-2">
            {[...new Set([...palette, template.primaryColor])].map(c => (
              <button key={c} type="button" onClick={() => setPrimaryColor(c)} aria-label={`Usar ${c}`} aria-pressed={color === c}
                className={cn('h-10 w-10 rounded-full border-2', color === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} />
            ))}
            <label className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-3 text-xs font-bold">
              <input type="color" value={color} onChange={e => setPrimaryColor(e.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" aria-label="Otro color" />
              {color.toUpperCase()}
            </label>
          </div>
        </div>
      </section>

      {/* Carta */}
      <section className={card} aria-labelledby="qt-carta">
        <h2 id="qt-carta" className="text-base font-extrabold">Carta</h2>
        <Segmented<MenuSource> value={menuSource} onChange={setMenuSource} options={[
          { value: 'template', label: 'Del rubro' }, { value: 'json', label: 'JSON' }, { value: 'clone', label: 'Copiar' }, { value: 'empty', label: 'Vacía' },
        ]} />
        {menuSource === 'template' && <p className="text-xs text-muted-foreground">Crea las categorías del rubro vacías; no se ven en el menú hasta que tengan productos.</p>}
        {menuSource === 'empty' && <p className="text-xs text-muted-foreground">Sin categorías: el dueño arma la carta desde su panel.</p>}
        {menuSource === 'json' && (
          <div className="space-y-2">
            <textarea value={menuJson} onChange={e => setMenuJson(e.target.value)} rows={7} spellCheck={false} placeholder='{"version":1,"categories":[{"name":"Pizzas","items":[{"name":"Muzzarella","price":12000}]}]}'
              className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs outline-none focus:border-primary" aria-label="JSON de la carta" />
            {jsonCheck && (jsonCheck.ok
              ? <p className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600"><Check size={14} /> {jsonCheck.stats.categories} categorías · {jsonCheck.stats.items} productos{jsonCheck.menu.version === 1 ? ' · precios en pesos' : ' · sin "version": precios en centavos'}</p>
              : <p className="text-xs font-bold text-destructive">{jsonCheck.error}</p>)}
            <button type="button" onClick={() => navigator.clipboard?.writeText(MENU_JSON_PROMPT).then(() => toast.success('Instrucción copiada')).catch(() => toast.error('No se pudo copiar'))}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary"><Copy size={13} /> Copiar instrucción para sacar el JSON de una foto con IA</button>
          </div>
        )}
        {menuSource !== 'clone' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cloneSettings} onChange={e => setCloneSettings(e.target.checked)} className="h-5 w-5" />
            Copiar horarios o modos de pedido de otro comercio
          </label>
        )}
        {usesClone && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div>
              <label className={label} htmlFor="qt-clone">Copiar de</label>
              <select id="qt-clone" className={field} value={clone.tenantId} onChange={e => setClone({ ...clone, tenantId: e.target.value })}>
                <option value="">Elegí un comercio…</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name} (/{t.slug})</option>)}
              </select>
            </div>
            {menuSource === 'clone' && (
              <div>
                <span className={label}>Carta</span>
                <Segmented value={clone.menu} onChange={v => setClone({ ...clone, menu: v })} options={[
                  { value: 'with_prices', label: 'Con precios' }, { value: 'without_prices', label: 'Sin precios' }, { value: 'none', label: 'No copiar' },
                ]} />
                {clone.menu === 'without_prices' && <p className="mt-1 text-xs text-muted-foreground">Los productos quedan pausados en $0 hasta que el dueño cargue sus precios.</p>}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={clone.schedules} onChange={e => setClone({ ...clone, schedules: e.target.checked })} /> Horarios (atención y de servicio)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={clone.orderModes} onChange={e => setClone({ ...clone, orderModes: e.target.checked })} /> Modos de pedido, delivery y reservas</label>
            <p className="text-xs text-muted-foreground">Nunca se copian cuentas de MercadoPago, usuarios, clientes, pedidos, PIN del POS ni impresoras.</p>
          </div>
        )}
      </section>

      {/* Organización */}
      <section className={card} aria-labelledby="qt-org">
        <h2 id="qt-org" className="text-base font-extrabold">Organización (multimarca)</h2>
        <Segmented<OrgMode> value={orgMode} onChange={setOrgMode} options={[{ value: 'none', label: 'Ninguna' }, { value: 'existing', label: 'Existente' }, { value: 'new', label: 'Nueva' }]} />
        {orgMode === 'existing' && (
          <select className={field} value={orgId} onChange={e => setOrgId(e.target.value)} aria-label="Organización">
            <option value="">Elegí la organización…</option>
            {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        {orgMode === 'new' && <input className={field} value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Nombre del grupo (Ej: Grupo Crash)" aria-label="Nombre de la organización" />}
        <p className="text-xs text-muted-foreground">Si el dueño ya tiene cuenta en TakeasyGO, elegí o creá una organización: se le suma esta marca sin crear otra cuenta.</p>
      </section>

      <label className="flex items-center gap-2 px-1 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
        Enviar la invitación por email (además del link para WhatsApp)
      </label>

      {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive" role="alert">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{ready ? `${name.trim()} · ${PLAN_LABELS[plan]} · ${locations.length} sede${locations.length > 1 ? 's' : ''}` : 'Completá nombre, email del dueño y dirección'}</p>
          <button type="button" onClick={submit} disabled={!ready || submitting}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-40">
            {submitting && <Loader2 size={16} className="animate-spin" />} {submitting ? 'Creando…' : 'Crear comercio'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultView({ result, onNew }: { result: Result; onNew: () => void }) {
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success('Link copiado')).catch(() => toast.error('No se pudo copiar'))
  const menuUrl = result.locations[0] ? `/${result.tenant.slug}/menu/${result.locations[0].slug}/takeaway` : `/${result.tenant.slug}`
  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <p className="inline-flex items-center gap-2 text-lg font-extrabold"><Check size={20} className="text-emerald-600" /> {result.reused ? 'Ya estaba creado' : 'Comercio creado'}</p>
        <p className="mt-1 text-sm">{result.tenant.name} · /{result.tenant.slug} · {PLAN_LABELS[result.tenant.plan as Plan] ?? result.tenant.plan} · {result.locations.length} sede{result.locations.length > 1 ? 's' : ''}{result.menuItems ? ` · ${result.menuItems} productos` : ''}</p>
      </section>

      {result.invite ? (
        <section className={card}>
          <h2 className="text-base font-extrabold">Invitación al dueño</h2>
          <p className="-mt-2 text-xs text-muted-foreground">{result.owner.email} · vence el {new Date(result.invite.expiresAt).toLocaleDateString('es-AR')} · {result.emailSent ? 'email enviado' : 'email no enviado'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <a href={result.invite.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white">
              <MessageCircle size={18} /> Enviar por WhatsApp
            </a>
            <button type="button" onClick={() => copy(result.invite!.url)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-bold">
              <Copy size={16} /> Copiar link
            </button>
          </div>
        </section>
      ) : result.owner.existingAccount ? (
        <section className={card}><p className="text-sm">El dueño ya tenía cuenta ({result.owner.email}): entra con su usuario de siempre y ve esta marca en su organización.</p></section>
      ) : null}

      {result.warnings.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <h2 className="text-sm font-extrabold">Para revisar</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>
        </section>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <a href={menuUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-bold"><ExternalLink size={15} /> Ver menú</a>
        <Link href={`/superadmin/tenants/${result.tenant.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border text-sm font-bold">Ficha y pendientes</Link>
        <button type="button" onClick={onNew} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-bold text-primary-foreground"><Plus size={15} /> Crear otro</button>
      </div>
    </div>
  )
}

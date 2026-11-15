// ============================================================================
// Landing — maquetas del producto hechas en código
// ============================================================================
// Reemplazan a las fotos y videos que estaban alojados en una cuenta externa
// que dejó de responder (401). Son ilustrativas: muestran cómo se ve cada
// parte del sistema, con datos de ejemplo. Decorativas para lectores de
// pantalla (aria-hidden): el texto de cada sección ya lo explica.
// ============================================================================

import {
  Banknote,
  Bell,
  CheckCircle2,
  ChefHat,
  Coffee,
  CreditCard,
  FileSpreadsheet,
  Gift,
  LayoutGrid,
  Pizza,
  Receipt,
  Salad,
  Sandwich,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wallet,
  WifiOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoMark } from './brand'

type IconType = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>

// ── POS: salón + cuenta ──────────────────────────────────────────────────────

const TABLES: Array<{ n: number; state: 'free' | 'busy' | 'bill' | 'paid'; who?: string; total?: string; round?: boolean }> = [
  { n: 1, state: 'busy', who: '4', total: '$48.200' },
  { n: 2, state: 'free' },
  { n: 3, state: 'bill', who: '2', total: '$26.900', round: true },
  { n: 4, state: 'busy', who: '6', total: '$91.500' },
  { n: 5, state: 'paid', who: '2', total: '$19.800', round: true },
  { n: 6, state: 'free' },
  { n: 7, state: 'busy', who: '3', total: '$37.400' },
  { n: 8, state: 'free', round: true },
  { n: 9, state: 'busy', who: '5', total: '$64.000' },
]

const TABLE_LOOK = {
  free: 'border-white/15 bg-white/[0.04] text-white/55',
  busy: 'border-[#f14722] bg-[#f14722] text-white',
  bill: 'border-amber-400 bg-amber-400 text-[#0d0b0a]',
  paid: 'border-emerald-500 bg-emerald-500 text-white',
}

export function PosMock({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('tgo-sans w-[560px] overflow-hidden rounded-[22px] border border-white/10 bg-[#15110f] shadow-[0_40px_80px_-20px_rgba(13,11,10,0.55)]', className)}>
      {/* Barra superior */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <LogoMark size={20} tone="light" />
          <span className="text-[12px] font-semibold text-white">Salón principal</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70">Turno noche</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            <span className="tgo-live-dot block size-1.5 rounded-full bg-emerald-400" /> En línea
          </span>
          <span className="flex size-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white">MR</span>
        </div>
      </div>

      <div className="grid grid-cols-[44px_1fr_190px]">
        {/* Lateral */}
        <div className="flex flex-col items-center gap-2 border-r border-white/10 py-3">
          {([LayoutGrid, ShoppingBag, Wallet, Receipt, Users] as IconType[]).map((Icon, i) => (
            <span key={i} className={cn('flex size-8 items-center justify-center rounded-lg', i === 0 ? 'bg-[#f14722] text-white' : 'text-white/45')}>
              <Icon size={15} />
            </span>
          ))}
        </div>

        {/* Plano de mesas */}
        <div className="p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Mesas</span>
            <div className="flex gap-2 text-[9px] font-medium text-white/55">
              <span className="flex items-center gap-1"><i className="block size-1.5 rounded-full bg-[#f14722]" />Ocupada</span>
              <span className="flex items-center gap-1"><i className="block size-1.5 rounded-full bg-amber-400" />Pidió cuenta</span>
              <span className="flex items-center gap-1"><i className="block size-1.5 rounded-full bg-emerald-500" />Pagada</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {TABLES.map((t) => (
              <div key={t.n} className={cn('flex h-[62px] flex-col items-center justify-center border', t.round ? 'rounded-full' : 'rounded-xl', TABLE_LOOK[t.state])}>
                <span className="text-[13px] font-bold leading-none">{t.n}</span>
                {t.total ? <span className="mt-1 text-[9px] font-semibold leading-none opacity-90">{t.total}</span> : <span className="mt-1 text-[9px] leading-none">Libre</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Cuenta */}
        <div className="flex flex-col border-l border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white">Mesa 4</span>
            <span className="text-[9px] font-medium text-white/50">6 personas</span>
          </div>
          <ul className="mt-2.5 space-y-1.5 text-[10px]">
            {[
              ['2', 'Provoleta', '$14.800'],
              ['3', 'Ojo de bife', '$52.500'],
              ['1', 'Ensalada César', '$9.200'],
              ['2', 'Malbec copa', '$15.000'],
            ].map(([q, name, price]) => (
              <li key={name} className="flex items-center justify-between gap-2 text-white/75">
                <span className="truncate"><b className="mr-1 text-white/45">{q}×</b>{name}</span>
                <span className="shrink-0 tabular-nums">{price}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-3">
            <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[11px] font-bold text-white">
              <span>Total</span>
              <span className="tabular-nums">$91.500</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <span className="flex h-7 items-center justify-center rounded-lg bg-white/10 text-[9px] font-semibold text-white/80">Dividir</span>
              <span className="flex h-7 items-center justify-center rounded-lg bg-[#f14722] text-[9px] font-bold text-white">Cobrar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Celular: carta online ────────────────────────────────────────────────────

const DISHES: Array<{ icon: IconType; tone: string; name: string; desc: string; price: string; tag?: string }> = [
  { icon: Sandwich, tone: 'bg-orange-100 text-orange-600', name: 'Burger doble cheddar', desc: 'Pan brioche, papas', price: '$12.900', tag: 'Más pedido' },
  { icon: Pizza, tone: 'bg-red-100 text-red-600', name: 'Pizza napolitana', desc: 'Mozzarella, tomate, ajo', price: '$15.400' },
  { icon: Salad, tone: 'bg-green-100 text-green-600', name: 'Ensalada César', desc: 'Pollo grillado, croutons', price: '$9.200' },
]

export function PhoneMock({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('tgo-sans w-[236px] rounded-[38px] border-[7px] border-[#0d0b0a] bg-white shadow-[0_40px_70px_-20px_rgba(13,11,10,0.5)]', className)}>
      <div className="relative overflow-hidden rounded-[31px]">
        <div className="absolute left-1/2 top-2 z-10 h-[18px] w-[72px] -translate-x-1/2 rounded-full bg-[#0d0b0a]" />
        {/* Cabecera del local */}
        <div className="bg-[#0d0b0a] px-4 pb-4 pt-9">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/50">Abierto · 20 a 30 min</p>
          <p className="tgo-serif mt-1 text-[21px] leading-none text-white">La Esquina</p>
          <div className="mt-3 flex gap-1.5">
            {['Retiro', 'Delivery', 'En la mesa'].map((m, i) => (
              <span key={m} className={cn('rounded-full px-2.5 py-1 text-[9px] font-semibold', i === 0 ? 'bg-[#f14722] text-white' : 'bg-white/10 text-white/70')}>{m}</span>
            ))}
          </div>
        </div>
        {/* Combo destacado */}
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2.5 rounded-2xl bg-[#f14722] p-2.5 text-white">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/20"><Sparkles size={16} /></span>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-80">Combo</p>
              <p className="truncate text-[11px] font-bold">2 burgers + papas + bebida</p>
            </div>
            <span className="ml-auto shrink-0 text-[11px] font-bold tabular-nums">$24.900</span>
          </div>
        </div>
        {/* Platos */}
        <ul className="space-y-2 px-3 pb-3 pt-2.5">
          {DISHES.map((d) => (
            <li key={d.name} className="flex items-center gap-2.5 rounded-2xl border border-zinc-100 p-2">
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', d.tone)}><d.icon size={20} strokeWidth={1.6} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold text-zinc-900">{d.name}</p>
                <p className="truncate text-[9px] text-zinc-500">{d.desc}</p>
                <p className="mt-0.5 text-[10px] font-bold tabular-nums text-zinc-900">{d.price}</p>
              </div>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0d0b0a] text-[13px] font-bold leading-none text-white">+</span>
            </li>
          ))}
        </ul>
        {/* Carrito */}
        <div className="px-3 pb-4">
          <div className="flex items-center justify-between rounded-full bg-[#0d0b0a] px-4 py-2.5 text-white">
            <span className="text-[10px] font-semibold">Ver pedido · 3</span>
            <span className="text-[11px] font-bold tabular-nums">$38.200</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Avisos flotantes ─────────────────────────────────────────────────────────

const NOTIF_LOOK = {
  order: { icon: Bell, tone: 'bg-[#f14722]/12 text-[#f14722]', bar: '#f14722' },
  paid: { icon: CheckCircle2, tone: 'bg-emerald-500/12 text-emerald-600', bar: '#22c55e' },
  kitchen: { icon: ChefHat, tone: 'bg-indigo-500/12 text-indigo-600', bar: '#6366f1' },
  offline: { icon: WifiOff, tone: 'bg-amber-500/15 text-amber-600', bar: '#f59e0b' },
  club: { icon: Star, tone: 'bg-fuchsia-500/12 text-fuchsia-600', bar: '#d946ef' },
} as const

export function NotifCard({ kind, title, sub, className }: { kind: keyof typeof NOTIF_LOOK; title: string; sub: string; className?: string }) {
  const look = NOTIF_LOOK[kind]
  const Icon = look.icon
  return (
    <div
      aria-hidden="true"
      className={cn('tgo-sans flex w-[224px] items-center gap-2.5 rounded-2xl bg-white/95 p-2.5 pr-3.5 shadow-[0_14px_36px_rgba(13,11,10,0.18)] backdrop-blur', className)}
      style={{ borderLeft: `3px solid ${look.bar}` }}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', look.tone)}><Icon size={17} /></span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-bold text-[#0d0b0a]">{title}</span>
        <span className="block truncate text-[10px] text-[#8a7f7a]">{sub}</span>
      </span>
    </div>
  )
}

// ── Piezas chicas para las tarjetas de «Gestión» ─────────────────────────────

/** Guía del inventario: avance + aviso con números. */
export function GuideMock() {
  return (
    <div aria-hidden="true" className="tgo-sans space-y-2">
      <div className="flex items-center gap-3 rounded-2xl border border-[#f14722]/25 bg-white p-3">
        <div className="relative flex size-11 shrink-0 items-center justify-center">
          <svg viewBox="0 0 44 44" className="size-11 -rotate-90">
            <circle cx="22" cy="22" r="18" fill="none" stroke="#efe9e3" strokeWidth="5" />
            <circle cx="22" cy="22" r="18" fill="none" stroke="#f14722" strokeWidth="5" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="45" />
          </svg>
          <span className="absolute text-[10px] font-bold">60%</span>
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#f14722]">Tu guía · Etapa 3 de 5</p>
          <p className="truncate text-[12px] font-bold text-zinc-900">Contá los mejillones</p>
        </div>
      </div>
      <div className="rounded-2xl border border-amber-500/40 bg-amber-50 p-3">
        <p className="text-[11px] font-bold text-amber-950">La receta pide 20 por plato y hay 12</p>
        <p className="mt-0.5 text-[10px] leading-snug text-amber-900/80">No alcanza para un plato entero. Te decimos cómo corregirlo.</p>
      </div>
    </div>
  )
}

/** Cambio masivo de precios. */
export function PricesMock() {
  const rows = [
    ['Burger doble', '$11.500', '$12.900'],
    ['Pizza napolitana', '$13.800', '$15.400'],
    ['Limonada', '$3.900', '$4.400'],
  ]
  return (
    <div aria-hidden="true" className="tgo-sans rounded-2xl border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded-full bg-[#0d0b0a] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white">+12% · redondeo a $100</span>
        <span className="text-[9px] font-semibold text-zinc-400">64 platos</span>
      </div>
      <ul className="divide-y divide-zinc-100 text-[11px]">
        {rows.map(([n, a, b]) => (
          <li key={n} className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-zinc-800">{n}</span>
            <span className="flex items-center gap-2 tabular-nums">
              <s className="text-zinc-400">{a}</s>
              <b className="text-[#f14722]">{b}</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Ventas de la semana. */
export function ReportMock({ dark }: { dark?: boolean }) {
  const bars = [42, 55, 48, 70, 88, 100, 76]
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  return (
    <div aria-hidden="true" className={cn('tgo-sans rounded-2xl border p-3', dark ? 'border-white/10 bg-white/[0.04]' : 'border-zinc-200 bg-white')}>
      <div className="flex items-end justify-between">
        <div>
          <p className={cn('text-[9px] font-semibold uppercase tracking-[0.14em]', dark ? 'text-white/45' : 'text-zinc-400')}>Ventas de la semana</p>
          <p className={cn('text-[20px] font-bold tabular-nums leading-tight', dark ? 'text-white' : 'text-zinc-900')}>$4.280.000</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
          <TrendingUp size={11} /> +18%
        </span>
      </div>
      <div className="mt-3 flex h-20 items-stretch gap-1.5">
        {bars.map((h, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className={cn('w-full rounded-t-md', i === 5 ? 'bg-[#f14722]' : dark ? 'bg-white/20' : 'bg-zinc-200')} style={{ height: `${h}%` }} />
            <span className={cn('text-[8px] font-semibold', dark ? 'text-white/40' : 'text-zinc-400')}>{days[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tarjeta del club de clientes. */
export function ClubMock() {
  return (
    <div aria-hidden="true" className="tgo-sans overflow-hidden rounded-2xl bg-[#0d0b0a] p-4 text-white">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/50">Club La Esquina</span>
        <Gift size={15} className="text-[#f14722]" />
      </div>
      <p className="mt-3 text-[26px] font-bold leading-none tabular-nums">1.240 <span className="text-[11px] font-medium text-white/50">puntos</span></p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-[72%] rounded-full bg-[#f14722]" />
      </div>
      <p className="mt-1.5 text-[10px] text-white/60">Te faltan 260 para un postre gratis</p>
    </div>
  )
}

/** Varias sedes de un vistazo. */
export function GroupMock() {
  const rows: Array<[string, string, string, boolean]> = [
    ['Palermo', '$1.920.000', '+14%', true],
    ['Belgrano', '$1.410.000', '+6%', true],
    ['Centro', '$950.000', '−3%', false],
  ]
  return (
    <div aria-hidden="true" className="tgo-sans rounded-2xl border border-zinc-200 bg-white p-3">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Tu grupo · esta semana</p>
      <ul className="divide-y divide-zinc-100 text-[11px]">
        {rows.map(([n, v, d, up]) => (
          <li key={n} className="flex items-center justify-between py-1.5">
            <span className="font-semibold text-zinc-800">{n}</span>
            <span className="flex items-center gap-2 tabular-nums">
              <b className="text-zinc-900">{v}</b>
              <span className={cn('w-10 text-right text-[10px] font-bold', up ? 'text-emerald-600' : 'text-red-600')}>{d}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Asistente TEO. */
export function TeoMock() {
  return (
    <div aria-hidden="true" className="tgo-sans space-y-2 rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#f14722] px-3 py-2 text-[11px] font-medium text-white">
        ¿Cómo cierro la caja del turno?
      </div>
      <div className="flex max-w-[92%] items-start gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black text-[#0d0b0a]">T</span>
        <div className="rounded-2xl rounded-tl-md bg-white/10 px-3 py-2 text-[11px] leading-relaxed text-white/90">
          Andá a <b>Caja › Cerrar turno</b>, contá los billetes y confirmá. Se imprime el reporte Z solo.
        </div>
      </div>
    </div>
  )
}

/** Precios desde una planilla o una foto de la carta. */
export function ImportMock() {
  return (
    <div aria-hidden="true" className="tgo-sans rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400"><FileSpreadsheet size={17} /></span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold text-white">carta-noviembre.xlsx</p>
          <p className="text-[10px] text-white/50">Leímos 86 precios · 71 cambian</p>
        </div>
        <span className="ml-auto rounded-full bg-[#f14722] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-white">Aplicar</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-[82%] rounded-full bg-emerald-400" />
      </div>
    </div>
  )
}

/** Medios de pago aceptados (texto real, no imagen). */
export function PayChips({ dark }: { dark?: boolean }) {
  const items: Array<[IconType, string]> = [
    [CreditCard, 'Mercado Pago'],
    [Banknote, 'Efectivo'],
    [Wallet, 'Transferencia'],
    [Coffee, 'Propinas'],
  ]
  return (
    <ul className="tgo-sans flex flex-wrap gap-2">
      {items.map(([Icon, label]) => (
        <li key={label} className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold', dark ? 'border-white/15 text-white/80' : 'border-zinc-200 text-zinc-700')}>
          <Icon size={13} /> {label}
        </li>
      ))}
    </ul>
  )
}

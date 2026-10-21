import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import CashRegister from '@/models/CashRegister'
import { headers } from 'next/headers'
import type mongoose from 'mongoose'
import { notFound } from 'next/navigation'
import { Banknote, AlertTriangle } from 'lucide-react'
import { getPageScope } from '@/lib/page-scope'
import { formatCents } from '@takeasygo/business'

// ============================================================================
// Cajas POS — cierres (reporte Z) visibles para el admin
// ============================================================================
// Auditoría POS Online V1 §6.5: el Z se generaba y guardaba inmutable al
// cerrar la caja en el POS, pero ningún panel del SaaS lo leía. Esta vista
// lista los cierres por sede (alcance de sede del usuario: getPageScope) con
// el desglose del Z tal como se guardó — nunca se recalcula.
// El shareToken NO se selecciona: es una credencial del link compartido.
// ============================================================================

const PAGE_SIZE = 60

const METHOD_LABELS = new Map<string, string>([
  ['cash', 'Efectivo'],
  ['mercadopago', 'MercadoPago'],
  ['posnet_debit', 'POSNET Débito'],
  ['posnet_credit', 'POSNET Crédito'],
  ['transfer', 'Transferencia'],
  ['kripton', 'Kripton'],
])

interface ZSnapshot {
  byPaymentMethod?: Record<string, number>
  salesTotal?: number
  incomeTotal?: number
  expenseTotal?: number
  refundTotal?: number
  totalMovements?: number
}

export default async function CajaPosPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id features.posEnabled')
    .lean<{ _id: mongoose.Types.ObjectId; features?: { posEnabled?: boolean } }>()
  if (!tenant) notFound()

  if (!tenant.features?.posEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <AlertTriangle size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cajas POS</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            El POS no está habilitado para este comercio. Contactá al soporte para activarlo.
          </p>
        </div>
      </div>
    )
  }

  const pageScope = await getPageScope()
  const [locations, registers] = await Promise.all([
    Location.find({ tenantId: tenant._id, ...pageScope.sedeFilter }).select('name').lean(),
    CashRegister.find({ tenantId: tenant._id, status: 'closed', ...pageScope.locationFilter })
      .select('locationId openedBy closedBy openedAt closedAt initialAmount expectedAmount finalAmount difference zReport')
      .sort({ closedAt: -1 })
      .limit(PAGE_SIZE)
      .lean(),
  ])

  const locationName = new Map(locations.map((l) => [String(l._id), String(l.name)]))

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Cajas POS</h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Cierres de caja del POS con su reporte Z (últimos {PAGE_SIZE}). Los montos son los del cierre: no se recalculan.
        </p>
      </div>

      {registers.length === 0 ? (
        <div className="py-24 text-center border-2 border-dashed border-border/60 rounded-[3rem] bg-muted/10">
          <Banknote className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground font-bold">Todavía no hay cajas cerradas desde el POS.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registers.map((reg) => {
            const z = (reg.zReport ?? {}) as ZSnapshot
            const difference = reg.difference ?? 0
            return (
              <details key={String(reg._id)} className="group rounded-3xl border-2 border-border/60 bg-card p-5">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black">
                      {locationName.get(String(reg.locationId)) ?? 'Sede'} ·{' '}
                      {reg.closedAt ? new Date(reg.closedAt).toLocaleString('es-AR') : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Abrió {reg.openedBy} {new Date(reg.openedAt).toLocaleString('es-AR')} · Cerró {reg.closedBy ?? '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ventas</div>
                      <div className="font-bold">{formatCents(z.salesTotal ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Diferencia</div>
                      <div className={difference === 0 ? 'font-bold' : difference > 0 ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>
                        {difference > 0 ? '+' : difference < 0 ? '−' : ''}
                        {formatCents(Math.abs(difference))}
                      </div>
                    </div>
                  </div>
                </summary>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-muted/30 p-4 text-sm">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Arqueo de efectivo</div>
                    <Row label="Inicial" value={formatCents(reg.initialAmount)} />
                    <Row label="Esperado" value={formatCents(reg.expectedAmount)} />
                    <Row label="Contado al cierre" value={formatCents(reg.finalAmount ?? 0)} />
                  </div>
                  <div className="rounded-2xl bg-muted/30 p-4 text-sm">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Por método de pago</div>
                    {Object.entries(z.byPaymentMethod ?? {}).length === 0 ? (
                      <div className="text-muted-foreground">Sin movimientos</div>
                    ) : (
                      Object.entries(z.byPaymentMethod ?? {}).map(([method, amount]) => (
                        <Row key={method} label={METHOD_LABELS.get(method) ?? method} value={formatCents(amount)} />
                      ))
                    )}
                    <Row label="Gastos" value={formatCents(z.expenseTotal ?? 0)} />
                    <Row label="Movimientos" value={String(z.totalMovements ?? 0)} />
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  )
}

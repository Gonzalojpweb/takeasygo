import Link from 'next/link'
import { Lock, PackageSearch } from 'lucide-react'
import { PLAN_LABELS, requiredPlanFor, type Plan } from '@/lib/plans'

// ============================================================================
// Estados de acceso de Inventario (server): plan sin inventario (Lock + CTA)
// o rol sin acceso. Compartido por la pantalla clásica y V3.
// ============================================================================

export function InventoryLocked({ tenantSlug, plan }: { tenantSlug: string; plan: Plan }) {
  const required = requiredPlanFor('inventory')
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
        <Lock size={32} className="text-muted-foreground" aria-hidden />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventario inteligente</h1>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          Cada venta descuenta sus insumos, sabés cuánto te cuesta cada plato y el sistema te dice
          qué verificar hoy en lugar de pedirte contar todo. Disponible desde el plan{' '}
          <span className="font-bold text-foreground">{PLAN_LABELS[required]}</span>.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="px-6 py-3 rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
          Tu plan actual: {PLAN_LABELS[plan]}
        </div>
        <Link href={`/${tenantSlug}/admin/billing`} className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold">
          Ver planes
        </Link>
      </div>
    </div>
  )
}

export function InventoryNoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <PackageSearch size={32} className="text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-bold">Tu rol no tiene acceso a Inventario</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Lo gestionan administración, managers, el gerente de operaciones y el jefe de cocina. Las ventas descuentan insumos solas.
      </p>
    </div>
  )
}

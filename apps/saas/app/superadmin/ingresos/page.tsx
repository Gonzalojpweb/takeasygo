import { TrendingUp } from 'lucide-react'
import PlatformRevenuePanel from '@/components/superadmin/PlatformRevenuePanel'

// Ingresos de la plataforma: comisiones por semana o mes, por medio de pago y
// cuánto aporta cada comercio. El layout del superadmin exige el rol; la API también.

export const dynamic = 'force-dynamic'

export default function SuperAdminIngresosPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight leading-none flex items-center gap-3">
          <TrendingUp size={32} className="text-primary" />
          Ingresos de la plataforma
        </h1>
        <p className="text-muted-foreground mt-3 font-medium flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-primary" />
          Comisiones por semana y por mes, y cuánto aporta cada comercio
        </p>
      </div>
      <PlatformRevenuePanel />
    </div>
  )
}

import { Building2 } from 'lucide-react'
import OrganizationsPanel from '@/components/superadmin/OrganizationsPanel'

// Multi-marca PR 9b — organizaciones (grupos de marcas). El layout del
// superadmin ya exige el rol; las APIs lo vuelven a exigir.

export const dynamic = 'force-dynamic'

export default function SuperAdminOrganizacionesPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight leading-none flex items-center gap-3">
          <Building2 size={32} className="text-primary" />
          Organizaciones
        </h1>
        <p className="text-muted-foreground mt-3 font-medium flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-primary" />
          Grupos de marcas: vinculación, equipo e invitaciones
        </p>
      </div>

      <OrganizationsPanel />
    </div>
  )
}

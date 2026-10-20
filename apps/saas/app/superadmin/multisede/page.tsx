import { Layers } from 'lucide-react'
import MultisedePanel from '@/components/superadmin/MultisedePanel'

export const dynamic = 'force-dynamic'

export default function SuperAdminMultisedePage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight leading-none flex items-center gap-3">
          <Layers size={32} className="text-primary" />
          Multisede
        </h1>
        <p className="text-muted-foreground mt-3 font-medium flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-primary" />
          Activación de llaves por negocio, condiciones, respaldo y modo observar
        </p>
      </div>

      <MultisedePanel />
    </div>
  )
}

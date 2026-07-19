import { Smartphone } from 'lucide-react'
import AppConsumersList from '@/components/superadmin/AppConsumersList'

export default function AppConsumersPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Smartphone size={20} />
          </div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Consumidores de App</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-[3.25rem]">
          Usuarios que se registraron desde la app móvil. Preferencias del onboarding, zonas y actividad.
        </p>
      </div>

      <AppConsumersList />
    </div>
  )
}

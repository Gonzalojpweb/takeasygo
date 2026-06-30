import { Users } from 'lucide-react'
import UsersList from '@/components/superadmin/UsersList'

export default function UsersPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Users size={20} />
          </div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Usuarios</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-[3.25rem]">
          Todos los usuarios registrados en la plataforma, sus membresías y actividad.
        </p>
      </div>

      <UsersList />
    </div>
  )
}

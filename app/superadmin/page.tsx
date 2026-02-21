import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function SuperAdminPage() {
  const session = await auth()

  if (!session || session.user.role !== 'superadmin') {
    redirect('/login')
  }

  return (
    <div>
      <h1>Panel SuperAdmin</h1>
      <p>Bienvenido, {session.user.name}</p>
      <p>Email: {session.user.email}</p>
      <p>Rol: {session.user.role}</p>
    </div>
  )
}

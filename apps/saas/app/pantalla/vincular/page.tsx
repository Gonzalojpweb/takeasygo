import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

// Destino del QR que muestra la pantalla: lleva al panel «Pantallas» del
// comercio de la sesión con el código ya cargado. Sin sesión → login y vuelta.
export default async function VincularPantallaPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams
  const safe = typeof code === 'string' && /^[A-Za-z0-9]{6}$/.test(code) ? code.toUpperCase() : ''
  const session = await auth()
  const user = session?.user as { tenantSlug?: string | null } | undefined
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/pantalla/vincular${safe ? `?code=${safe}` : ''}`)}`)
  if (!user.tenantSlug) redirect('/login')
  redirect(`/${user.tenantSlug}/admin/pantallas${safe ? `?code=${safe}` : ''}`)
}

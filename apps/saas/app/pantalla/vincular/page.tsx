import { redirect } from 'next/navigation'
import { getIdentitySession } from '@/lib/tenant-access'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'

// Destino del QR que muestra la pantalla: lleva al panel «Pantallas» del
// comercio del usuario con el código ya cargado. Sin sesión → login y vuelta.
// El comercio se lee de la base (no del JWT): contrato de identidad.
export default async function VincularPantallaPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams
  const safe = typeof code === 'string' && /^[A-Za-z0-9]{6}$/.test(code) ? code.toUpperCase() : ''
  const session = await getIdentitySession()
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/pantalla/vincular${safe ? `?code=${safe}` : ''}`)}`)
  await connectDB()
  const u = await User.findById(session.user.id).select('tenantId').lean<{ tenantId?: unknown }>()
  const t = u?.tenantId ? await Tenant.findById(String(u.tenantId)).select('slug').lean<{ slug?: string }>() : null
  if (!t?.slug) redirect('/login')
  redirect(`/${t.slug}/admin/pantallas${safe ? `?code=${safe}` : ''}`)
}

/**
 * Pendientes de activación de un comercio: qué falta para que esté completo.
 * Se ve en la ficha de Superadmin y en el panel del dueño. Solo lectura.
 */
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import Location from '@/models/Location'
import Menu from '@/models/Menu'

export interface ActivationItem {
  key: 'owner' | 'menu' | 'logo' | 'hours' | 'mercadopago' | 'profile'
  label: string
  done: boolean
  /** Dónde se resuelve (texto para el usuario). */
  hint: string
  /** Ruta del panel del comercio donde se resuelve. */
  href: string
  /** Bloquea vender si falta. */
  essential: boolean
}

export interface ActivationStatus {
  items: ActivationItem[]
  done: number
  total: number
  complete: boolean
}

type MenuDoc = { categories?: Array<{ items?: unknown[]; subcategories?: Array<{ items?: unknown[] }> }> }
const menuHasItems = (m: MenuDoc) =>
  (m.categories ?? []).some(c => (c.items?.length ?? 0) > 0 || (c.subcategories ?? []).some(s => (s.items?.length ?? 0) > 0))

export async function getActivationStatus(tenantId: string): Promise<ActivationStatus | null> {
  const tenant = await Tenant.findById(tenantId)
    .select('slug branding.logoUrl profile.about profile.social mercadopago.isConfigured')
    .lean<{ slug: string; branding?: { logoUrl?: string }; profile?: { about?: string; social?: Record<string, string> }; mercadopago?: { isConfigured?: boolean } }>()
  if (!tenant) return null

  const [ownerActive, locations, menus] = await Promise.all([
    User.exists({ tenantId, role: 'admin', isActive: true, password: { $exists: true, $nin: [null, ''] } }),
    Location.find({ tenantId, isActive: true }).select('hours').lean<{ hours?: string }[]>(),
    Menu.find({ tenantId }).select('categories').lean<MenuDoc[]>(),
  ])
  const admin = `/${tenant.slug}/admin`
  const social = tenant.profile?.social ?? {}

  const items: ActivationItem[] = [
    { key: 'owner', label: 'El dueño activó su cuenta', done: Boolean(ownerActive), hint: 'Se activa con el link de invitación (se puede reenviar desde Superadmin).', href: `${admin}/settings`, essential: true },
    { key: 'menu', label: 'La carta tiene productos', done: menus.some(menuHasItems), hint: 'Menú: cargar productos, importar la carta o leerla de una foto (Élite).', href: `${admin}/menu`, essential: true },
    { key: 'logo', label: 'Logo cargado', done: Boolean(tenant.branding?.logoUrl), hint: 'Configuración › Identidad.', href: `${admin}/settings`, essential: false },
    { key: 'hours', label: 'Horario de atención', done: locations.length > 0 && locations.every(l => Boolean(l.hours?.trim())), hint: 'Configuración › Sedes › Horarios de atención.', href: `${admin}/settings`, essential: false },
    { key: 'mercadopago', label: 'Cobros con MercadoPago conectados', done: Boolean(tenant.mercadopago?.isConfigured), hint: 'Lo autoriza el dueño desde Configuración › Pagos.', href: `${admin}/settings`, essential: false },
    { key: 'profile', label: 'Historia y redes del local', done: Boolean(tenant.profile?.about?.trim() || social.instagram || social.facebook), hint: 'Configuración › Perfil.', href: `${admin}/settings`, essential: false },
  ]
  const done = items.filter(i => i.done).length
  return { items, done, total: items.length, complete: done === items.length }
}

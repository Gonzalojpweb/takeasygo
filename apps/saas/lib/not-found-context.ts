// ============================================================================
// 404 oficial — a dónde volver según dónde estaba la persona (07/11/2026)
// ============================================================================
// Una sola página (app/not-found.tsx) para direcciones que no existen y para
// cada notFound(). La dirección pedida llega en `x-pathname` (lo pone
// proxy.ts). Esta función pura decide marca, textos y botones de vuelta.
// ============================================================================

export interface NotFoundTenant {
  slug: string
  name: string
  logoUrl?: string | null
  primaryColor?: string | null
  status?: string | null
}

export interface NotFoundLink { href: string; label: string }

export interface NotFoundContext {
  /** 'tenant' = con la marca del comercio; 'tgo' = marca TakeasyGO */
  brand: 'tenant' | 'tgo'
  tenant: NotFoundTenant | null
  title: string
  message: string
  primary: NotFoundLink
  secondary: NotFoundLink | null
}

const TGO_HOME: NotFoundLink = { href: '/', label: 'Ir a TakeasyGO' }

function safePath(pathname: string | null | undefined): string {
  const p = (pathname ?? '/').split('?')[0]
  return p.startsWith('/') && !p.startsWith('//') ? p : '/'
}

export function firstSegment(pathname: string | null | undefined): string | null {
  return safePath(pathname).split('/').filter(Boolean)[0] ?? null
}

export function resolveNotFoundContext(pathname: string | null | undefined, tenant: NotFoundTenant | null): NotFoundContext {
  const path = safePath(pathname)
  const seg = path.split('/').filter(Boolean)
  const base = (title: string, message: string, primary: NotFoundLink, secondary: NotFoundLink | null = TGO_HOME): NotFoundContext =>
    ({ brand: 'tgo', tenant: null, title, message, primary, secondary })

  // ── Áreas propias de TakeasyGO ──────────────────────────────────────────
  if (seg[0] === 'superadmin') {
    return base('Esta sección no existe', 'La página del superadmin que buscás no existe o cambió de lugar.', { href: '/superadmin', label: 'Volver al superadmin' }, null)
  }
  if (seg[0] === 'grupo') {
    return base('No encontramos esta página del grupo', 'Puede que el grupo no exista o que tu usuario no tenga acceso a él.', { href: '/grupo', label: 'Volver a mis grupos' }, { href: '/login', label: 'Ingresar con otra cuenta' })
  }
  if (seg[0] === 'explore' || seg[0] === 'app') {
    return base('No encontramos esta página', 'El lugar que buscás no existe o ya no está disponible.', { href: '/explore', label: 'Explorar comercios' })
  }
  if (seg[0] === 'seller') {
    return base('No encontramos esta página', 'La sección que buscás no existe.', { href: '/seller', label: 'Volver a mi panel' })
  }

  // ── Un comercio ─────────────────────────────────────────────────────────
  if (tenant && tenant.status !== 'deleted') {
    const t = `/${tenant.slug}`
    const branded = (title: string, message: string, primary: NotFoundLink, secondary: NotFoundLink | null): NotFoundContext =>
      ({ brand: 'tenant', tenant, title, message, primary, secondary })
    if (seg[1] === 'admin') {
      return { ...branded('Esta sección del panel no existe', 'La página que buscás no existe, cambió de lugar o tu rol no la tiene.', { href: `${t}/admin`, label: 'Volver al panel' }, { href: t, label: 'Ver la carta' }), brand: 'tgo' }
    }
    if (seg[1] === 'business') {
      return branded('No encontramos esta página', 'La sección que buscás no existe.', { href: `${t}/business`, label: 'Volver a Business' }, { href: t, label: 'Ver la carta' })
    }
    if (seg[1] === 'club') {
      return branded('No encontramos esta página del club', 'Puede que el enlace esté vencido o mal copiado.', { href: `${t}/club`, label: 'Volver al club' }, { href: t, label: 'Ver la carta' })
    }
    if (seg[1] === 'tracking') {
      return branded('No encontramos este pedido', 'Revisá el número de pedido o el enlace que te llegó. Si pagaste, el comercio tiene tu pedido.', { href: t, label: `Volver a ${tenant.name}` }, null)
    }
    if (seg[1] === 'reservas') {
      return branded('No encontramos esta reserva', 'El enlace puede estar vencido o mal copiado.', { href: `${t}/reservas`, label: 'Hacer una reserva' }, { href: t, label: 'Ver la carta' })
    }
    return branded('Este plato se fue de la carta', 'La página que buscás no existe o ya no está disponible.', { href: t, label: `Volver a ${tenant.name}` }, null)
  }

  if (seg.length >= 1 && seg[0]) {
    return base('Este comercio no está en TakeasyGO', 'Revisá la dirección: puede estar mal escrita o el comercio ya no usa TakeasyGO.', { href: '/explore', label: 'Explorar comercios' })
  }
  return base('Página no encontrada', 'La dirección que buscás no existe.', TGO_HOME, null)
}

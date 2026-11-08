import Link from 'next/link'
import Image from 'next/image'
import { headers } from 'next/headers'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { firstSegment, resolveNotFoundContext, type NotFoundTenant } from '@/lib/not-found-context'

// 404 oficial de TakeasyGO: marca y botón de vuelta según el contexto
// (carta del comercio, panel, superadmin, grupo…). Ver lib/not-found-context.ts.

export const metadata = { title: 'Página no encontrada · TakeasyGO', robots: { index: false } }

const RESERVED = new Set(['superadmin', 'grupo', 'explore', 'app', 'seller', 'api', 'login', 'auth', 'tgo'])
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i

async function findTenant(slug: string | null): Promise<NotFoundTenant | null> {
  if (!slug || RESERVED.has(slug) || !/^[a-z0-9-]{1,80}$/.test(slug)) return null
  try {
    await connectDB()
    const t = await Tenant.findOne({ slug }).select('slug name status branding.logoUrl branding.primaryColor')
      .lean<{ slug: string; name: string; status?: string; branding?: { logoUrl?: string; primaryColor?: string } }>()
    if (!t) return null
    return { slug: t.slug, name: t.name, status: t.status ?? null, logoUrl: t.branding?.logoUrl || null, primaryColor: t.branding?.primaryColor || null }
  } catch {
    return null // la 404 nunca debe romperse por la base
  }
}

export default async function NotFound() {
  const h = await headers()
  const pathname = h.get('x-pathname')
  const tenant = await findTenant(h.get('x-tenant-slug') ?? firstSegment(pathname))
  const ctx = resolveNotFoundContext(pathname, tenant)
  const accent = ctx.brand === 'tenant' && ctx.tenant?.primaryColor && HEX_COLOR.test(ctx.tenant.primaryColor) ? ctx.tenant.primaryColor : '#0a0a0a'
  const showTenantLogo = ctx.brand === 'tenant' && ctx.tenant?.logoUrl

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 flex flex-col items-center gap-3">
          {showTenantLogo ? (
            // Logo del comercio (URL externa): <img> para no depender de los dominios de next/image
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ctx.tenant!.logoUrl!} alt={ctx.tenant!.name} className="h-20 w-20 rounded-2xl object-cover shadow-sm" />
          ) : (
            <Image src="/tgoicon-192.png" alt="TakeasyGO" width={72} height={72} className="rounded-2xl shadow-sm" priority />
          )}
          {ctx.brand === 'tenant' && ctx.tenant && <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{ctx.tenant.name}</p>}
        </div>

        <p className="text-7xl font-black tracking-tight" style={{ color: accent }} aria-hidden>404</p>
        <h1 className="mt-4 text-2xl font-black">{ctx.title}</h1>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{ctx.message}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={ctx.primary.href} className="rounded-2xl px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: accent }}>
            {ctx.primary.label}
          </Link>
          {ctx.secondary && (
            <Link href={ctx.secondary.href} className="rounded-2xl border border-zinc-300 px-6 py-3 text-sm font-bold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">
              {ctx.secondary.label}
            </Link>
          )}
        </div>

        <p className="mt-12 text-xs text-zinc-400">
          {ctx.brand === 'tenant' ? 'Con la tecnología de ' : ''}<Link href="/" className="font-semibold hover:underline">TakeasyGO</Link>
        </p>
      </div>
    </main>
  )
}

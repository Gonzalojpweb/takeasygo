import type { Metadata } from 'next'
import type { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import MpSplitLink from '@/models/MpSplitLink'
import { hashSplitLinkToken } from '@/lib/mp-split-guard'

// ============================================================================
// Autorizar el split de MercadoPago — página del link que manda TakeasyGO
// ============================================================================
// La abre el dueño del restaurante (sin entrar al panel). Explica qué
// autoriza y lo manda a MercadoPago a iniciar sesión en SU cuenta.
// ============================================================================

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Autorizar MercadoPago — TakeasyGO', robots: { index: false, follow: false } }

const fmt = (d: Date) => d.toLocaleString('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })

export default async function AuthorizeMercadoPagoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let tenantName: string | null = null
  let expiresAt: Date | null = null
  if (/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    await connectDB()
    const link = await MpSplitLink.findOne({ tokenHash: hashSplitLinkToken(token), usedAt: null, expiresAt: { $gt: new Date() } })
      .select('tenantId expiresAt')
      .lean<{ tenantId: Types.ObjectId; expiresAt: Date }>()
    if (link) {
      const tenant = await Tenant.findById(link.tenantId).select('name').lean<{ name: string }>()
      tenantName = tenant?.name ?? null
      expiresAt = link.expiresAt
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-orange-50 px-4 py-12">
      <div className="mx-auto max-w-lg space-y-6">
        {!tenantName ? (
          <div className="space-y-3 rounded-[2rem] border-2 border-border/60 bg-white p-8 text-center shadow-xl">
            <h1 className="text-2xl font-black text-gray-900">Este link ya no es válido</h1>
            <p className="text-sm text-gray-600">Puede que ya se haya usado o que haya vencido (dura 48 horas). Pedile a TakeasyGO uno nuevo.</p>
          </div>
        ) : (
          <>
            <header className="space-y-2 text-center">
              <p className="text-xs font-black uppercase tracking-widest text-sky-700">TakeasyGO × MercadoPago</p>
              <h1 className="text-2xl font-black text-gray-900 text-balance">Conectá MercadoPago de {tenantName}</h1>
              <p className="text-sm text-gray-600">Es un paso único para que tus clientes puedan pagar con MercadoPago en tu menú online.</p>
            </header>

            <section className="space-y-3 rounded-[2rem] border-2 border-border/60 bg-white p-6 shadow-sm">
              <h2 className="text-base font-black text-gray-900">Qué estás autorizando</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
                <li><strong>La plata de tus ventas sigue cayendo en tu cuenta de MercadoPago</strong>, como hasta ahora.</li>
                <li>En cada cobro, MercadoPago separa sola la comisión de TakeasyGO (el «split de pagos»). No tenés que transferir nada.</li>
                <li>Tus credenciales no se tocan. TakeasyGO no puede retirar ni mover tu dinero.</li>
                <li>Una vez conectado, la conexión la administra TakeasyGO desde la plataforma.</li>
              </ul>
            </section>

            <section className="space-y-3 rounded-[2rem] border-2 border-border/60 bg-white p-6 shadow-sm">
              <h2 className="text-base font-black text-gray-900">Cómo hacerlo</h2>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
                <li>Tocá «Autorizar en MercadoPago».</li>
                <li>Iniciá sesión con <strong>la cuenta de MercadoPago donde cobra {tenantName}</strong> (si tenés otra abierta, cerrala primero).</li>
                <li>Aceptá el permiso. Te traemos de vuelta acá con la confirmación.</li>
              </ol>
              <a href={`/api/mp-oauth/link/${token}`} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#009EE3] px-5 text-base font-bold text-white hover:bg-[#0089c7]">
                Autorizar en MercadoPago
              </a>
              {expiresAt && <p className="text-center text-xs text-gray-500">El link sirve una sola vez y vence el {fmt(expiresAt)}.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

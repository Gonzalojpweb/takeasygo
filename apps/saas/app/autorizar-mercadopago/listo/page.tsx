import type { Metadata } from 'next'

// Resultado de la autorización del split por link (lo muestra el callback).

export const metadata: Metadata = { title: 'MercadoPago — TakeasyGO', robots: { index: false, follow: false } }

const REASONS: Record<string, string> = {
  mp_denied: 'No se aceptó el permiso en MercadoPago. Si fue sin querer, pedile a TakeasyGO un link nuevo.',
  link_invalid: 'El link ya se usó o venció. Pedile a TakeasyGO uno nuevo.',
  user_id_mismatch: 'Iniciaste sesión con una cuenta de MercadoPago distinta a la que tiene cargada tu comercio. Cerrá esa sesión y volvé a intentar con la cuenta donde cobrás.',
  user_id_conflict: 'Esa cuenta de MercadoPago ya está conectada a otro comercio en TakeasyGO. Usá la cuenta donde cobra este comercio.',
  rate_limited: 'Hubo demasiados intentos seguidos. Esperá un minuto y volvé a abrir el link.',
}

export default async function AuthorizeResultPage({ searchParams }: { searchParams: Promise<{ estado?: string; motivo?: string }> }) {
  const { estado, motivo } = await searchParams
  const ok = estado === 'ok'
  const reason = motivo ? REASONS[motivo.split(':')[0]] : undefined
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-orange-50 px-4 py-12">
      <div className="mx-auto max-w-md space-y-4 rounded-[2rem] border-2 border-border/60 bg-white p-8 text-center shadow-xl">
        <p className="text-4xl" aria-hidden>{ok ? '✅' : '⚠️'}</p>
        <h1 className="text-2xl font-black text-gray-900">{ok ? '¡Listo! MercadoPago quedó conectado' : 'No se pudo conectar MercadoPago'}</h1>
        <p className="text-sm text-gray-600">
          {ok
            ? 'Tus clientes ya pueden pagar con MercadoPago. La plata cae en tu cuenta y la comisión de TakeasyGO se descuenta sola en cada cobro. Ya podés cerrar esta página.'
            : reason ?? 'Algo falló en el camino. Volvé a abrir el link o pedile uno nuevo a TakeasyGO.'}
        </p>
        {!ok && motivo && <p className="text-xs text-gray-400">Código: {motivo}</p>}
      </div>
    </main>
  )
}

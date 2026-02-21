import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-6xl mx-auto">
        <h1 className="text-white font-black text-xl tracking-tight">Takeasygo</h1>
        <Link href="/login">
          <button className="text-zinc-400 hover:text-white text-sm transition-colors">
            Iniciar sesión
          </button>
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5 text-xs text-zinc-400 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Plataforma para restaurantes
        </div>

        <h2 className="text-5xl font-black tracking-tight leading-tight mb-6 lg:text-7xl">
          El menú digital
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-400 to-zinc-600">
            que se adapta a vos
          </span>
        </h2>

        <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-10">
          Menú digital, pedidos takeaway y pagos online para tu restaurante. Con tu branding, tus colores y tu identidad.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="mailto:hola@takeasygo.com">
            <button className="px-8 py-4 bg-white text-zinc-900 font-bold rounded-2xl hover:bg-zinc-100 transition-colors">
              Quiero mi menú digital
            </button>
          </a>
          <Link href="/login">
            <button className="px-8 py-4 border border-zinc-700 text-zinc-400 font-medium rounded-2xl hover:text-white hover:border-zinc-500 transition-colors">
              Acceder al panel
            </button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-8 py-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              emoji: '🎨',
              title: 'Tu marca, tu identidad',
              description: 'Colores, tipografía y layout adaptados a cada restaurante. No hay dos iguales.',
            },
            {
              emoji: '🥡',
              title: 'Pedidos takeaway',
              description: 'Los clientes piden y pagan desde el menú digital. Vos solo preparás y entregás.',
            },
            {
              emoji: '💳',
              title: 'Pagos con MercadoPago',
              description: 'Integración directa con tu cuenta. El dinero va directo a vos.',
            },
            {
              emoji: '📍',
              title: 'Múltiples sedes',
              description: 'Un restaurante, varias sucursales. Cada una con su menú y configuración.',
            },
            {
              emoji: '📊',
              title: 'Panel de gestión',
              description: 'Dashboard completo con pedidos, reportes y gestión de menú en tiempo real.',
            },
            {
              emoji: '📱',
              title: 'QR para el local',
              description: 'Generá QRs ilimitados para cada mesa o sector del restaurante.',
            },
          ].map(feature => (
            <div key={feature.title}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors">
              <div className="text-3xl mb-4">{feature.emoji}</div>
              <h3 className="text-white font-bold mb-2">{feature.title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Planes */}
      <section className="max-w-4xl mx-auto px-8 py-16">
        <h3 className="text-center text-2xl font-black mb-10">Planes simples, sin sorpresas</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              name: 'Probar',
              price: 'USD 250',
              sub: '+ USD 15/mes x 3 meses',
              features: ['Menú digital', 'Pedidos takeaway', 'Pagos MP', 'QRs ilimitados', 'Soporte 3 meses'],
            },
            {
              name: 'Comprar',
              price: 'USD 600',
              sub: 'Pago único',
              featured: true,
              features: ['Todo lo anterior', 'Sin pagos mensuales', 'Soporte 1 año'],
            },
            {
              name: 'Full Access',
              price: 'USD 800',
              sub: 'Pago único',
              features: ['Todo lo anterior', 'Base de clientes', 'Upselling', 'Impresión térmica', '15% comisión referidos', 'Soporte 1 año'],
            },
          ].map(plan => (
            <div key={plan.name}
              className={`rounded-2xl p-6 border ${plan.featured
                ? 'bg-white text-zinc-900 border-white'
                : 'bg-zinc-900 text-white border-zinc-800'}`}>
              <h4 className="font-black text-lg mb-1">{plan.name}</h4>
              <p className="text-2xl font-black mb-1">{plan.price}</p>
              <p className={`text-xs mb-6 ${plan.featured ? 'text-zinc-500' : 'text-zinc-600'}`}>{plan.sub}</p>
              <ul className="space-y-2">
                {plan.features.map(f => (
                  <li key={f} className={`text-sm flex items-center gap-2 ${plan.featured ? 'text-zinc-700' : 'text-zinc-400'}`}>
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-8 py-8 mt-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-zinc-600 text-sm">© 2026 Takeasygo</p>
          <a href="mailto:hola@takeasygo.com" className="text-zinc-600 text-sm hover:text-white transition-colors">
            hola@takeasygo.com
          </a>
        </div>
      </footer>

    </div>
  )
}
import { terminos } from '@/lib/legal-content'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white font-geist antialiased selection:bg-orange-500/10 selection:text-orange-600">
      <main className="max-w-4xl mx-auto px-5 py-20 text-zinc-800">
        <h1 className="text-3xl md:text-5xl font-black mb-8 text-zinc-900 uppercase">Términos y Condiciones</h1>

        <div className="space-y-8 leading-relaxed">
          {terminos.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold mb-4 text-zinc-900 uppercase">{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-16 text-center">
          <a href="/" className="inline-block px-6 py-3 bg-zinc-900 text-white font-bold uppercase tracking-widest text-xs hover:bg-orange-500 transition-colors">
            Volver al inicio
          </a>
        </div>
      </main>
    </div>
  )
}

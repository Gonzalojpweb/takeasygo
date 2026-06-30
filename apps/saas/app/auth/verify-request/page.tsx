import { Mail, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function VerifyRequestPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--c-bg)] p-6">
      <div className="w-full max-w-[380px] text-center">
        <div className="w-20 h-20 rounded-3xl bg-[#f14722]/10 flex items-center justify-center mx-auto mb-6">
          <Mail size={36} className="text-[#f14722]" />
        </div>

        <h1 className="text-2xl font-bold text-[#f7f4f2] mb-3">
          Revisá tu email
        </h1>

        <p className="text-[#5a524d] text-sm mb-8 leading-relaxed">
          Te enviamos un link mágico a tu correo. Hacé click en el link para continuar.
          El link expira en 15 minutos.
        </p>

        <div className="bg-[var(--c-surface)] rounded-2xl p-4 mb-8 border border-[var(--c-border)]">
          <p className="text-xs text-[#5a524d] leading-relaxed">
            ¿No encontrás el email? Revisá la carpeta de spam o correo no deseado.
          </p>
        </div>

        <Link
          href="/app/profile"
          className="inline-flex items-center gap-2 text-sm text-[#5a524d] hover:text-[#f7f4f2] font-medium transition-colors"
        >
          <ArrowLeft size={16} />
          Volver al perfil
        </Link>
      </div>
    </div>
  )
}

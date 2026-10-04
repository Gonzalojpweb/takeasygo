'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, Clock, FileText, Loader2, XCircle, } from 'lucide-react'
import { PuntoTGO } from '@/components/tgo/PuntoTGO'
import { Confetti } from '@/registry/magicui/confetti'

type Logo = { slug: string; name: string; logoUrl: string }

type Props = {
  slug: string
  status: 'pending_review' | 'rejected' | 'draft'
  rejectionReason?: string | null
  submittedAt?: Date | null
}

const STEPS = [
  { key: 'sent', label: 'Solicitud enviada', hint: 'Recibimos tus datos, tu plan y tu carta.' },
  { key: 'review', label: 'En revisión', hint: 'El equipo configura tu menú y valida la cuenta.' },
  { key: 'approved', label: 'Cuenta aprobada', hint: 'Te avisamos por email y se activa tu panel.' },
]

export default function OnboardingEstadoView({ slug, status, rejectionReason, submittedAt }: Props) {
  const [open, setOpen] = useState(false)
  const [logos, setLogos] = useState<Logo[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/network/logos')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setLogos((data.logos ?? []) as Logo[])
      } catch {
        if (!cancelled) setLogos([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const activeIndex = status === 'pending_review' ? 1 : -1
  const submittedLabel =
    submittedAt instanceof Date && !Number.isNaN(submittedAt.getTime())
      ? submittedAt.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
      : null

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 text-center">
        {status === 'pending_review' && (
          <>
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-6">
              <Clock className="h-8 w-8 text-blue-600" />
              <Confetti
                particleCount={80}
                spread={100}
                colors={['#F74211', '#FAB300', '#12B76A', '#7A5AF8', '#3B82F6']}
                disableForReducedMotion={true}
              />
              <PuntoTGO expression="happy" hasCrown ring="gold" size="xl" animate />
            </div>
            <h1 className="text-2xl font-bold mb-2">Revisión en curso</h1>
            <p className="text-gray-600 mb-3">
              Recibimos tu solicitud y estamos configurando los últimos detalles de tu menú.
              Te enviamos un email en cuanto esté listo.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Suele tomar menos de 24 horas hábiles.
            </p>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-2 bg-black text-white px-6 py-3 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Ver estado de la solicitud
              <ChevronDown
                size={16}
                className={`transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>

            {open && (
              <div className="mt-7 text-left border-t border-gray-100 pt-6">
                <ol className="space-y-0">
                  {STEPS.map((s, i) => {
                    const done = i < activeIndex
                    const active = i === activeIndex
                    return (
                      <li key={s.key} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full ${
                              done
                                ? 'bg-emerald-100 text-emerald-700'
                                : active
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-400'
                            }`}
                          >
                            {done ? (
                              <CheckCircle2 size={16} />
                            ) : active ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <span className="text-xs font-bold">{i + 1}</span>
                            )}
                          </span>
                          {i < STEPS.length - 1 && (
                            <span
                              className={`w-px flex-1 my-1 ${done ? 'bg-emerald-300' : 'bg-gray-200'}`}
                            />
                          )}
                        </div>
                        <div className="pb-6">
                          <p
                            className={`text-sm font-semibold ${
                              active ? 'text-blue-700' : done ? 'text-gray-900' : 'text-gray-400'
                            }`}
                          >
                            {s.label}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{s.hint}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
                {submittedLabel && (
                  <p className="text-xs text-gray-400 -mt-2">Enviada el {submittedLabel}</p>
                )}
              </div>
            )}
          </>
        )}

        {status === 'rejected' && (
          <>
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2 text-red-900">Revisión rechazada</h1>
            <p className="text-gray-600 mb-4">Hubo un problema con tu solicitud.</p>
            {rejectionReason && (
              <div className="bg-red-50 p-4 rounded-lg text-red-700 text-sm mb-6 text-left">
                <strong>Motivo:</strong> {rejectionReason}
              </div>
            )}
            <a
              href={`/${slug}/admin/onboarding`}
              className="inline-block bg-black text-white px-6 py-3 rounded-full text-sm font-medium"
            >
              Volver a editar mi perfil
            </a>
          </>
        )}

        {status === 'draft' && (
          <>
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-amber-100 mb-6">
              <FileText className="h-8 w-8 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Solicitud incompleta</h1>
            <p className="text-gray-600 mb-6">Todavía no enviaste tu perfil a revisión.</p>
            <a
              href={`/${slug}/admin/onboarding`}
              className="inline-block bg-black text-white px-6 py-3 rounded-full text-sm font-medium"
            >
              Continuar configurando
            </a>
          </>
        )}
      </div>

      {/* Prueba social: red de restaurantes que ya cobran en la plataforma */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <p className="text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">
          Ya son parte de la red
        </p>
        <p className="text-xs text-gray-500 mb-4">
          Restaurantes activos cobrando con Mercado Pago y transferencia en TakeasyGO.
        </p>

        {logos === null ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
            <Loader2 size={14} className="animate-spin" /> Cargando la red…
          </div>
        ) : logos.length === 0 ? null : (
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {logos.map((l) => (
              <li
                key={l.slug}
                className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2 py-2"
                title={l.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={l.logoUrl}
                  alt={l.name}
                  className="h-8 w-8 rounded-full object-cover shrink-0 grayscale"
                />
                <span className="text-[11px] font-semibold text-gray-600 truncate">{l.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

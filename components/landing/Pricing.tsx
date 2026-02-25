'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Check, Handshake } from 'lucide-react'
import PlanLeadModal from './PlanLeadModal'

interface Plan {
    id: string
    name: string
    price: string
    sub: string
    desc?: string
    features: string[]
    featured?: boolean
}

const mensualPlans: Plan[] = [
    {
        id: 'inicial-mensual',
        name: 'Inicial',
        price: '30',
        sub: 'Hasta 500 clientes',
        features: [
            'QR y menú consumo en local',
            'Club de fidelización',
            'Soporte Básico',
        ],
    },
    {
        id: 'crecimiento-mensual',
        name: 'Crecimiento',
        price: '50',
        sub: 'Hasta 1500 clientes',
        featured: true,
        features: [
            'QR menú local & takeaway',
            'Club de fidelización',
            'Upselling inteligente',
            'Notificaciones (limitadas)',
            'Soporte Priority',
        ],
    },
    {
        id: 'premium-mensual',
        name: 'Premium',
        price: '80',
        sub: 'Clientes ilimitados',
        features: [
            'QR menú local & takeaway',
            'Club de fidelización',
            'Upselling inteligente',
            'Notificaciones ilimitadas',
            'Soporte Priority',
        ],
    },
]

const inversorPlans: Plan[] = [
    {
        id: 'moderado-inversion',
        name: 'Moderado',
        price: '600',
        sub: 'Inversión única por sede',
        desc: 'Mismas funciones del Plan Crecimiento. Sin cargos mensuales.',
        features: [
            'Todas las funciones de Crecimiento',
            'Propiedad de la app',
            'Sin mensualidades',
            'Base de clientes',
            'Prioridad en nuevas features',
        ],
    },
    {
        id: 'experto-inversion',
        name: 'Experto',
        price: '800',
        sub: 'Inversión única por sede',
        desc: 'El ecosistema Premium completo como activo de tu negocio.',
        featured: true,
        features: [
            'Todas las funciones Premium',
            'Notificaciones ilimitadas',
            'Propiedad de la app',
            'Sin mensualidades',
            'Base de clientes',
            'Prioridad en nuevas features',
        ],
    },
]

export default function Pricing() {
    const [type, setType] = useState<'mensual' | 'inversion'>('mensual')
    const [modal, setModal] = useState<{ plan: string; planId: string } | null>(null)

    const openModal = (plan: Plan) =>
        setModal({
            plan: `${plan.name} – USD ${plan.price}${type === 'mensual' ? '/mes' : ' único'}`,
            planId: plan.id,
        })

    const plans = type === 'mensual' ? mensualPlans : inversorPlans

    return (
        <>
            <section id="pricing" className="bg-white py-20 md:py-32 px-5 md:px-6">
                <div className="max-w-7xl mx-auto">

                    {/* ── Header ─────────────────────────────────────────── */}
                    <div className="text-center mb-12 md:mb-16">
                        <span className="text-[#f14722] font-bold uppercase tracking-[0.3em] text-[10px]">
                            Modelos de Negocio
                        </span>
                        <h2 className="text-3xl md:text-5xl font-bold text-zinc-900 tracking-tight mt-4 mb-8">
                            Elige cómo quieres crecer.
                        </h2>

                        {/* Switcher */}
                        <div className="flex items-center justify-center gap-1 p-1 bg-zinc-50 rounded-full w-fit mx-auto border border-zinc-100 shadow-inner">
                            <button
                                onClick={() => setType('mensual')}
                                className={cn(
                                    'px-4 md:px-8 py-2 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap',
                                    type === 'mensual'
                                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-100'
                                        : 'text-zinc-400 hover:text-zinc-600'
                                )}
                            >
                                Suscripción Mensual
                            </button>
                            <button
                                onClick={() => setType('inversion')}
                                className={cn(
                                    'px-4 md:px-8 py-2 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap',
                                    type === 'inversion'
                                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-100'
                                        : 'text-zinc-400 hover:text-zinc-600'
                                )}
                            >
                                Inversión Única
                            </button>
                        </div>
                    </div>

                    {/* ── Plan cards ─────────────────────────────────────── */}
                    <div className={cn(
                        'grid gap-5 md:gap-8 items-stretch justify-center max-w-6xl mx-auto',
                        plans.length === 3
                            ? 'grid-cols-1 md:grid-cols-3'
                            : 'grid-cols-1 md:grid-cols-2 md:max-w-3xl'
                    )}>
                        {plans.map((plan) => (
                            <div
                                key={plan.id}
                                className={cn(
                                    'rounded-[2rem] md:rounded-[2.5rem] p-7 md:p-10 border transition-all duration-500 flex flex-col h-full',
                                    plan.featured
                                        ? 'bg-white border-zinc-900 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] md:scale-105 z-10'
                                        : 'bg-zinc-50/50 border-zinc-100 hover:border-zinc-200'
                                )}
                            >
                                <h4 className="text-zinc-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-6">
                                    {plan.name}
                                </h4>

                                <div className="flex items-baseline gap-1 mb-2">
                                    <span className="text-xl font-bold text-zinc-900 italic">USD</span>
                                    <span className="text-5xl font-bold text-zinc-900 tracking-tighter">{plan.price}</span>
                                    {type === 'mensual' && (
                                        <span className="text-zinc-400 font-medium lowercase">/mes</span>
                                    )}
                                </div>
                                <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wider mb-4">
                                    {plan.sub}
                                </p>

                                {plan.desc && (
                                    <p className="text-zinc-400 text-xs leading-relaxed mb-4">{plan.desc}</p>
                                )}

                                <ul className="space-y-4 mb-10 mt-auto">
                                    {plan.features.map((f, j) => (
                                        <li key={j} className="flex gap-3 text-zinc-500 text-[13px] font-medium leading-tight">
                                            <Check size={16} className="text-orange-500 shrink-0 mt-0.5" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={() => openModal(plan)}
                                    className={cn(
                                        'w-full h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all cursor-pointer border',
                                        plan.featured
                                            ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-[#f14722] hover:border-[#f14722]'
                                            : 'bg-white text-zinc-900 border-zinc-200 hover:bg-zinc-50'
                                    )}
                                >
                                    {type === 'mensual' ? 'Suscribirse' : 'Adquirir Activo'}
                                </button>
                            </div>
                        ))}
                    </div>

                    {type === 'inversion' && (
                        <p className="text-center text-zinc-400 text-xs mt-10 md:mt-12 max-w-lg mx-auto leading-relaxed px-4">
                            * El modelo de inversión única convierte la plataforma en un activo propio del restaurante, sin dependencia de pagos mensuales. Ideal para quienes buscan solidez patrimonial a largo plazo.
                        </p>
                    )}

                    {/* ── Partner card ───────────────────────────────────── */}
                    <div className="mt-14 md:mt-20 max-w-4xl mx-auto">
                        <div className="relative rounded-[2rem] md:rounded-[2.5rem] border border-zinc-100 bg-zinc-50/60 p-8 md:p-12 overflow-hidden flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-12">
                            {/* Decorative glow */}
                            <div
                                className="absolute top-0 right-0 w-64 h-64 pointer-events-none"
                                style={{
                                    background: 'radial-gradient(ellipse at 80% 20%, rgba(241,71,34,0.07) 0%, transparent 65%)',
                                }}
                            />

                            {/* Icon */}
                            <div className="shrink-0 w-14 h-14 rounded-2xl bg-[#f14722]/10 flex items-center justify-center">
                                <Handshake size={24} strokeWidth={1.5} className="text-[#f14722]" />
                            </div>

                            {/* Copy */}
                            <div className="flex-1 min-w-0">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f14722] mb-2 block">
                                    Programa de Socios
                                </span>
                                <h3 className="text-zinc-900 font-bold text-xl md:text-2xl tracking-tight mb-3">
                                    Ganá un 15% por cada cliente que recomendés.
                                </h3>
                                <p className="text-zinc-500 text-sm leading-relaxed max-w-lg">
                                    Como socio estratégico recibís el&nbsp;
                                    <strong className="text-zinc-700">15% del valor de la licencia</strong> por cada cliente que cerremos gracias a tu recomendación.
                                    Pago único al cierre de la venta — sin comisiones recurrentes, sin extensiones, sin letra chica.
                                </p>
                            </div>

                            {/* CTA */}
                            <button
                                onClick={() =>
                                    setModal({
                                        plan: 'Socio Estratégico – 15% por referido',
                                        planId: 'socio-estrategico',
                                    })
                                }
                                className="shrink-0 h-12 px-8 rounded-xl bg-zinc-900 text-white font-bold text-[10px] uppercase tracking-widest hover:bg-[#f14722] transition-all whitespace-nowrap cursor-pointer border-0"
                            >
                                Ser Socio Estratégico
                            </button>
                        </div>
                    </div>

                </div>
            </section>

            {/* ── Modal ─────────────────────────────────────────────── */}
            {modal && (
                <PlanLeadModal
                    plan={modal.plan}
                    planId={modal.planId}
                    onClose={() => setModal(null)}
                />
            )}
        </>
    )
}

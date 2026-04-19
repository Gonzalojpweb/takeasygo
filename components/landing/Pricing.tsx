'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Check, Handshake, ChevronDown, ChevronUp, Star, Zap } from 'lucide-react'
import PlanLeadModal from './PlanLeadModal'
import { PLAN_FEATURES_LANDING } from '@/lib/plans'

interface LandingPlan {
    id: string
    name: string
    price: string
    sub: string
    desc?: string
    planKey?: 'try' | 'buy' | 'full'
    featuredFeatures?: string[]
    extraFeatures?: string[]
    features?: string[]
    featured?: boolean
    anchorPrice?: string   // precio tachado (referencia más alta)
    anchorSavings?: string // badge de ahorro (ej: "Ahorrás $117.000")
    anchorHint?: string    // texto sutil debajo del precio (mensual)
}

const mensualPlans: LandingPlan[] = [
    {
        id: 'inicial-mensual',
        name: 'Inicial',
        price: '75.000',
        sub: 'Para empezar a vender online',
        planKey: 'try',
        featuredFeatures: PLAN_FEATURES_LANDING.try.featured,
        extraFeatures: PLAN_FEATURES_LANDING.try.extra,
    },
    {
        id: 'crecimiento-mensual',
        name: 'Crecimiento',
        price: '80.000',
        sub: 'Para escalar tu operación',
        planKey: 'buy',
        featured: true,
        featuredFeatures: PLAN_FEATURES_LANDING.buy.featured,
        extraFeatures: PLAN_FEATURES_LANDING.buy.extra,
        anchorHint: 'Con pago anual pagás $63.750/mes · Ahorrás $135.000/año',
    },
    {
        id: 'premium-mensual',
        name: 'Premium',
        price: '95.000',
        sub: 'Para optimizar con datos',
        planKey: 'full',
        featuredFeatures: PLAN_FEATURES_LANDING.full.featured,
        extraFeatures: PLAN_FEATURES_LANDING.full.extra,
    },
]

const anualPlans: LandingPlan[] = [
    {
        id: 'inicial-anual',
        name: 'Inicial',
        price: '663.000',
        sub: 'Pago anual anticipado · 15% OFF',
        planKey: 'try',
        featuredFeatures: PLAN_FEATURES_LANDING.try.featured,
        extraFeatures: PLAN_FEATURES_LANDING.try.extra,
    },
    {
        id: 'crecimiento-anual',
        name: 'Crecimiento',
        price: '765.000',
        sub: 'Pago anual anticipado · 15% OFF',
        planKey: 'buy',
        featured: true,
        featuredFeatures: PLAN_FEATURES_LANDING.buy.featured,
        extraFeatures: PLAN_FEATURES_LANDING.buy.extra,
        anchorPrice: '900.000',
        anchorSavings: 'Ahorrás $135.000',
    },
    {
        id: 'premium-anual',
        name: 'Premium',
        price: '918.000',
        sub: 'Pago anual anticipado · 15% OFF',
        planKey: 'full',
        featuredFeatures: PLAN_FEATURES_LANDING.full.featured,
        extraFeatures: PLAN_FEATURES_LANDING.full.extra,
    },
]

function PlanCard({
    plan,
    type,
    onOpen,
}: {
    plan: LandingPlan
    type: 'mensual' | 'anual'
    onOpen: () => void
}) {
    const [expanded, setExpanded] = useState(false)
    const hasFeatured = !!plan.featuredFeatures
    const visibleFeatures = hasFeatured
        ? (expanded ? [...plan.featuredFeatures!, ...plan.extraFeatures!] : plan.featuredFeatures!)
        : plan.features ?? []

    return (
        <div
            className={cn(
                'rounded-[2rem] md:rounded-[2.5rem] p-7 md:p-10 border transition-all duration-500 flex flex-col h-full',
                plan.featured
                    ? 'bg-white border-zinc-900 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] md:scale-105 z-10'
                    : 'bg-zinc-50/50 border-zinc-100 hover:border-zinc-200'
            )}
        >
            <div className="flex items-center justify-between mb-6">
                <h4 className="text-zinc-400 font-bold text-[10px] uppercase tracking-[0.2em]">
                    {plan.name}
                </h4>
                {plan.featured && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-zinc-900 text-white">
                        Más popular
                    </span>
                )}
            </div>

            {/* Anchor: precio tachado + badge de ahorro (plan anual) */}
            {plan.anchorPrice && (
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-zinc-400 line-through text-sm font-medium">
                        ${plan.anchorPrice}/año
                    </span>
                    <span className="bg-[#f14722] text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                        {plan.anchorSavings}
                    </span>
                </div>
            )}

            <div className="flex items-baseline gap-1 mb-2">
                <span className="text-xl font-bold text-zinc-900 italic">$ARG</span>
                <span className="text-5xl font-bold text-zinc-900 tracking-tighter">{plan.price}</span>
                <span className="text-zinc-400 font-medium lowercase">
                    {type === 'mensual' ? '/mes' : '/año'}
                </span>
            </div>

            {/* Anchor hint: empuja al plan anual desde el plan mensual */}
            {plan.anchorHint ? (
                <p className="text-[10px] font-semibold text-emerald-600 mb-4 leading-relaxed">
                    ✦ {plan.anchorHint}
                </p>
            ) : (
                <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wider mb-4">
                    {plan.sub}
                </p>
            )}

            {plan.desc && (
                <p className="text-zinc-400 text-xs leading-relaxed mb-4">{plan.desc}</p>
            )}

            <ul className="space-y-4 mt-2">
                {visibleFeatures.map((f, j) => (
                    <li key={j} className="flex gap-3 text-zinc-500 text-[13px] font-medium leading-tight">
                        <Check size={16} className="text-orange-500 shrink-0 mt-0.5" />
                        {f}
                    </li>
                ))}
            </ul>

            {hasFeatured && plan.extraFeatures && plan.extraFeatures.length > 0 && (
                <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    className="mt-4 flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-orange-500 transition-colors self-start"
                >
                    {expanded ? (
                        <><ChevronUp size={14} /> Ocultar</>
                    ) : (
                        <><ChevronDown size={14} /> Ver todo lo incluido</>
                    )}
                </button>
            )}

            <div className="flex-1" />

            <button
                onClick={onOpen}
                className={cn(
                    'w-full h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all cursor-pointer border mt-8',
                    plan.featured
                        ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-[#f14722] hover:border-[#f14722]'
                        : 'bg-white text-zinc-900 border-zinc-200 hover:bg-zinc-50'
                )}
            >
                {type === 'mensual' ? 'Suscribirse' : 'Contratar Anual'}
            </button>
        </div>
    )
}

const FOUNDER_FEATURES = [
    { icon: '⚡', label: 'Dashboard de administración' },
    { icon: '🍽️', label: 'Menú digital completo' },
    { icon: '⚙️', label: 'Configuración del restaurante' },
    { icon: '💳', label: 'Gestión de facturación' },
]

function FounderBanner({ onOpen }: { onOpen: () => void }) {
    return (
        <div className="relative mb-16 md:mb-20">
            {/* Glow de fondo */}
            <div
                className="absolute inset-0 rounded-[2.5rem] pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.12) 0%, transparent 70%)',
                }}
            />

            <div className="relative rounded-[2rem] md:rounded-[2.5rem] border border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 p-8 md:p-12 overflow-hidden">

                {/* Fondo decorativo */}
                <div
                    className="absolute top-0 right-0 w-80 h-80 pointer-events-none opacity-30"
                    style={{
                        background: 'radial-gradient(ellipse at 80% 20%, rgba(245,158,11,0.25) 0%, transparent 60%)',
                    }}
                />

                <div className="relative flex flex-col md:flex-row items-start md:items-center gap-10 md:gap-16">

                    {/* ── Copy ── */}
                    <div className="flex-1 min-w-0">
                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2 mb-5">
                            <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full bg-amber-500 text-white">
                                <Star size={9} fill="white" />
                                Acceso Anfitriones
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border border-amber-300 text-amber-700 bg-amber-50">
                                <Zap size={9} />
                                Lanzamiento Limitado
                            </span>
                        </div>

                        {/* Título */}
                        <h3 className="text-zinc-900 font-bold text-2xl md:text-3xl tracking-tight mb-2">
                            El mejor momento para empezar<br className="hidden md:block" /> es ahora.
                        </h3>
                        <p className="text-zinc-500 text-sm leading-relaxed max-w-md mb-6">
                            Cupos exclusivos para los primeros restaurantes en sumarse a la plataforma.
                            Acceso completo al panel, menú digital, configuración y facturación.
                        </p>

                        {/* Features grid */}
                        <div className="grid grid-cols-2 gap-2.5">
                            {FOUNDER_FEATURES.map((f) => (
                                <div key={f.label} className="flex items-center gap-2 text-zinc-600 text-xs font-medium">
                                    <span className="text-base leading-none">{f.icon}</span>
                                    {f.label}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Precio ── */}
                    <div className="shrink-0 flex flex-col items-start md:items-center gap-5">
                        <div className="bg-white border border-amber-100 rounded-2xl p-6 shadow-sm text-center min-w-[200px]">
                            {/* Anchor diario */}
                            <div className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 mb-4">
                                ✦ Menos de $250/día
                            </div>

                            <div className="flex items-baseline justify-center gap-1 mb-1">
                                <span className="text-sm font-bold text-zinc-400 italic">$ARG</span>
                                <span className="text-5xl font-bold text-zinc-900 tracking-tighter">7.500</span>
                            </div>
                            <p className="text-zinc-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                                / mes
                            </p>
                            <p className="text-zinc-400 text-[10px] leading-relaxed">
                                = $7.500 ÷ 30 días
                            </p>
                        </div>

                        <button
                            onClick={onOpen}
                            className="w-full h-12 px-8 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] uppercase tracking-widest transition-all cursor-pointer border-0 shadow-lg shadow-amber-500/20 whitespace-nowrap"
                        >
                            Quiero ser Anfitrión
                        </button>

                        <p className="text-zinc-400 text-[10px] text-center leading-relaxed">
                            Cupos limitados · Sin permanencia
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function Pricing() {
    const [type, setType] = useState<'mensual' | 'anual'>('mensual')
    const [modal, setModal] = useState<{ plan: string; planId: string } | null>(null)

    const plans = type === 'mensual' ? mensualPlans : anualPlans

    return (
        <>
            <section id="pricing" className="bg-white py-20 md:py-32 px-5 md:px-6">
                <div className="max-w-7xl mx-auto">

                    {/* ── Banner Anfitriones ──────────────────────────────── */}
                    {/* 
                    <FounderBanner
                        onOpen={() => setModal({ plan: 'Anfitriones — $7.500/mes', planId: 'anfitrion' })}
                    /> 
                    */}

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
                                onClick={() => setType('anual')}
                                className={cn(
                                    'px-4 md:px-8 py-2 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap',
                                    type === 'anual'
                                        ? 'bg-white text-zinc-900 shadow-sm border border-zinc-100'
                                        : 'text-zinc-400 hover:text-zinc-600'
                                )}
                            >
                                Pago Anual · 15% OFF
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
                            <PlanCard
                                key={plan.id}
                                plan={plan}
                                type={type}
                                onOpen={() => setModal({
                                    plan: `${plan.name} – $ARG ${plan.price}${type === 'mensual' ? '/mes' : '/año'}`,
                                    planId: plan.id,
                                })}
                            />
                        ))}
                    </div>

                    {type === 'anual' && (
                        <p className="text-center text-zinc-400 text-xs mt-10 md:mt-12 max-w-lg mx-auto leading-relaxed px-4">
                            * El precio anual se abona de forma anticipada y equivale a 10.2 meses de servicio. Renovación anual. Mismo plan, mismas funcionalidades.
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

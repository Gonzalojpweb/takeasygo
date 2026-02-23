'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

const mensualPlans = [
    {
        name: 'Inicial',
        price: '25',
        sub: 'Hasta 500 clientes',
        features: ['QR Menu consumo en local', 'Club de fidelización', 'Soporte Básico']
    },
    {
        name: 'Crecimiento',
        price: '45',
        featured: true,
        sub: 'Hasta 1500 clientes',
        features: ['QR Menu local & Takeaway', 'Club de fidelización', 'Upselling Inteligente', 'Notificaciones (Limitadas)']
    },
    {
        name: 'Ilimitada',
        price: '75',
        sub: 'Clientes ilimitados',
        features: ['Todo lo anterior', 'Notificaciones Ilimitadas', 'Soporte Priority', 'Analitycs Pro']
    }
]

const inversorPlans = [
    {
        name: 'Moderado',
        price: '600',
        sub: 'Inversión única por sede',
        desc: 'Mismas funciones del Plan Crecimiento, pero sin cargos mensuales.',
        features: ['Propiedad de la app', 'Sin mensualidades', 'Soporte 1 año', 'Base de clientes']
    },
    {
        name: 'Experto',
        price: '800',
        featured: true,
        sub: 'Inversión única por sede',
        desc: 'El ecosistema ilimitado completo bajo tu activo empresarial.',
        features: ['Todo lo anterior ilimitado', 'Soporte Pro 1 año', 'Mantenimiento incluido', 'Prioridad en nuevas features']
    }
]

export default function Pricing() {
    const [type, setType] = useState<'mensual' | 'inversion'>('mensual')

    return (
        <section id="pricing" className="bg-white py-32 px-6">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <span className="text-zinc-400 font-bold uppercase tracking-[0.3em] text-[10px]">Modelos de Negocio</span>
                    <h2 className="text-3xl md:text-5xl font-bold text-zinc-900 tracking-tight mt-4 mb-8">
                        Elige cómo quieres crecer.
                    </h2>

                    {/* Switcher */}
                    <div className="flex items-center justify-center gap-2 p-1 bg-zinc-50 rounded-full w-fit mx-auto border border-zinc-100 shadow-inner">
                        <button
                            onClick={() => setType('mensual')}
                            className={cn("px-8 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all", type === 'mensual' ? "bg-white text-zinc-900 shadow-sm border border-zinc-100" : "text-zinc-400 hover:text-zinc-600")}
                        >
                            Suscripción Mensual
                        </button>
                        <button
                            onClick={() => setType('inversion')}
                            className={cn("px-8 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all", type === 'inversion' ? "bg-white text-zinc-900 shadow-sm border border-zinc-100" : "text-zinc-400 hover:text-zinc-600")}
                        >
                            Inversión Única
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center justify-center max-w-6xl mx-auto">
                    {(type === 'mensual' ? mensualPlans : inversorPlans).map((plan, i) => (
                        <div
                            key={i}
                            className={cn(
                                "rounded-[2.5rem] p-10 border transition-all duration-500 flex flex-col h-full",
                                plan.featured
                                    ? "bg-white border-zinc-900 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] scale-105 z-10"
                                    : "bg-zinc-50/50 border-zinc-100 hover:border-zinc-200"
                            )}
                        >
                            <h4 className="text-zinc-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-6">{plan.name}</h4>
                            <div className="flex items-baseline gap-1 mb-2">
                                <span className="text-xl font-bold text-zinc-900 italic">USD</span>
                                <span className="text-5xl font-bold text-zinc-900 tracking-tighter">{plan.price}</span>
                                {type === 'mensual' && <span className="text-zinc-400 font-medium lowercase">/mes</span>}
                            </div>
                            <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-wider mb-8">{plan.sub}</p>

                            <ul className="space-y-4 mb-10 mt-auto">
                                {plan.features.map((f, j) => (
                                    <li key={j} className="flex gap-3 text-zinc-500 text-[13px] font-medium leading-tight">
                                        <Check size={16} className="text-orange-500 shrink-0" />
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            <Button className={cn(
                                "w-full h-12 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all",
                                plan.featured ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50"
                            )}>
                                {type === 'mensual' ? "Suscribirse" : "Adquirir Activo"}
                            </Button>
                        </div>
                    ))}

                    {/* Center alignment fix for investors (2 cards) */}
                    {type === 'inversion' && <div className="hidden md:block" />}
                </div>

                {type === 'inversion' && (
                    <p className="text-center text-zinc-400 text-xs mt-12 max-w-lg mx-auto leading-relaxed">
                        * El modelo de inversión única permite al restaurante ser dueño de su propia infraestructura digital, ideal para quienes buscan solidez patrimonial a largo plazo.
                    </p>
                )}
            </div>
        </section>
    )
}

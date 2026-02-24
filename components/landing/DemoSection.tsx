'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const demoImages = [
    'https://images.unsplash.com/photo-1517248135467-4c7ed9d73c7a?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=2074&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1590650153855-d9e808231d41?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=2070&auto=format&fit=crop',
]

// Duplicate for seamless infinite loop
const carouselImages = [...demoImages, ...demoImages]

export default function DemoSection() {
    const [isPaused, setIsPaused] = useState(false)

    return (
        <>
            <style>{`
                @keyframes carousel-scroll {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
                .demo-track {
                    animation: carousel-scroll 28s linear infinite;
                }
            `}</style>

            <section id="demo" className="bg-white py-20 md:py-32 overflow-hidden border-t border-zinc-100">

                {/* ── Header + Form ─────────────────────────────────────────── */}
                <div className="max-w-5xl mx-auto px-5 md:px-6 mb-14 md:mb-20 text-center">
                    <h2 className="text-4xl md:text-7xl font-bold text-zinc-900 tracking-tight mb-3 md:mb-4">
                        Solicita Demo
                    </h2>
                    <p className="text-zinc-500 text-base md:text-lg font-medium">
                        Aumenta la fidelidad. Impulsa las ventas.
                    </p>

                    {/* Form */}
                    <form
                        className="mt-10 md:mt-16 flex flex-col md:flex-row flex-wrap gap-6 md:gap-8 items-stretch md:items-end justify-center"
                        onSubmit={(e) => e.preventDefault()}
                        noValidate
                    >
                        {/* Name */}
                        <div className="flex flex-col gap-2 w-full md:min-w-[180px] md:flex-1 text-left">
                            <label
                                htmlFor="demo-name"
                                className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest ml-1"
                            >
                                Nombre
                            </label>
                            <input
                                id="demo-name"
                                name="name"
                                type="text"
                                autoComplete="name"
                                placeholder="Tu nombre"
                                className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm"
                            />
                        </div>

                        {/* Business Name */}
                        <div className="flex flex-col gap-2 w-full md:min-w-[180px] md:flex-1 text-left">
                            <label
                                htmlFor="demo-business"
                                className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest ml-1"
                            >
                                Negocio
                            </label>
                            <input
                                id="demo-business"
                                name="business"
                                type="text"
                                autoComplete="organization"
                                placeholder="Nombre del restaurante"
                                className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm"
                            />
                        </div>

                        {/* Email */}
                        <div className="flex flex-col gap-2 w-full md:min-w-[180px] md:flex-1 text-left">
                            <label
                                htmlFor="demo-email"
                                className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest ml-1"
                            >
                                Email
                            </label>
                            <input
                                id="demo-email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                placeholder="tu@email.com"
                                className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm"
                            />
                        </div>

                        {/* Phone */}
                        <div className="flex flex-col gap-2 w-full md:min-w-[160px] md:flex-1 text-left">
                            <label
                                htmlFor="demo-phone"
                                className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest ml-1"
                            >
                                Teléfono
                            </label>
                            <input
                                id="demo-phone"
                                name="phone"
                                type="tel"
                                autoComplete="tel"
                                placeholder="+54 9 11 0000 0000"
                                className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm"
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full md:w-auto bg-zinc-900 text-white rounded-full px-10 md:px-12 h-14 font-bold uppercase tracking-widest text-[11px] shadow-xl hover:bg-[#f14722] transition-all mt-2 md:mt-0 shrink-0"
                        >
                            Solicitar
                        </Button>
                    </form>
                </div>

                {/* ── Infinite auto-scroll carousel ─────────────────────────── */}
                <div
                    className="overflow-hidden"
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                    onTouchStart={() => setIsPaused(true)}
                    onTouchEnd={() => setIsPaused(false)}
                    onTouchCancel={() => setIsPaused(false)}
                    aria-hidden="true"
                >
                    <div
                        className="demo-track flex gap-4 md:gap-6 pl-5 md:pl-6"
                        style={{
                            width: 'max-content',
                            animationPlayState: isPaused ? 'paused' : 'running',
                        }}
                    >
                        {carouselImages.map((src, i) => (
                            <div
                                key={i}
                                className="min-w-[240px] md:min-w-[300px] h-[160px] md:h-[200px] rounded-2xl md:rounded-3xl overflow-hidden border border-zinc-100 shadow-sm flex-shrink-0"
                            >
                                <img
                                    src={src}
                                    alt=""
                                    className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                                    loading="lazy"
                                    draggable={false}
                                />
                            </div>
                        ))}
                    </div>
                </div>

            </section>
        </>
    )
}

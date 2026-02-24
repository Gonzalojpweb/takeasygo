'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export default function Hero() {
    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');
            `}</style>

            <section
                id="what-we-do"
                className="relative min-h-[100vh] flex items-center overflow-hidden px-6 md:px-20"
                style={{ background: '#f7f4f1' }}
            >
                {/* Ambient glow naranja — desktop: bottom right radial */}
                <div
                    className="absolute pointer-events-none hidden md:block"
                    style={{
                        bottom: '-15%',
                        right: '-5%',
                        width: '60vw',
                        height: '60vw',
                        background: 'radial-gradient(ellipse at 60% 70%, rgba(216, 60, 25, 0.35) 0%, rgba(216, 60, 25, 0.18) 30%,transparent 55%)',
                    }}
                />
                <div
                    className="absolute pointer-events-none hidden md:block"
                    style={{
                        bottom: '5%',
                        right: '10%',
                        width: '35vw',
                        height: '35vw',
                        background: 'radial-gradient(ellipse at 50% 50%, rgba(241,71,34,0.07) 0%, transparent 65%)',
                    }}
                />

                {/* Mobile glow — degradado desde el pie hacia arriba */}
                <div
                    className="absolute pointer-events-none md:hidden"
                    style={{
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '72%',
                        background: 'radial-gradient(ellipse 200% 60% at 50% 100%, rgba(241,71,34, 0.01) 0%, rgb(241,71,34) 38%, transparent 95%)',
                    }}
                />

                {/* Línea decorativa vertical */}
                <div
                    className="absolute top-0 bottom-0 pointer-events-none hidden md:block"
                    style={{
                        left: '80px',
                        width: '1px',
                        background: 'linear-gradient(to bottom, transparent, rgba(13,11,10,0.07) 20%, rgba(13,11,10,0.07) 80%, transparent)',
                    }}
                />

                {/* Content */}
                <div className="relative z-10 max-w-3xl pt-24 pb-32 md:pl-8">

                    {/* Eyebrow */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.7 }}
                        className="flex items-center gap-3 mb-10"
                    >
                        <span style={{ width: 36, height: 1, background: '#f14722', display: 'block', flexShrink: 0 }} />
                        <span style={{
                            fontSize: 10,
                            fontFamily: "'DM Sans', sans-serif",
                            fontWeight: 500,
                            letterSpacing: '0.22em',
                            textTransform: 'uppercase',
                            color: '#8a8280',
                        }}>
                            Infraestructura digital para la gastronomía
                        </span>
                    </motion.div>

                    {/* H1 */}
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                        style={{
                            fontFamily: "'DM Serif Display', serif",
                            fontSize: 'clamp(36px, 5vw, 64px)',
                            fontWeight: 400,
                            lineHeight: 1.08,
                            letterSpacing: '-0.02em',
                            color: '#0d0b0a',
                            marginBottom: 28,
                        }}
                    >
                        Una experiencia de venta <br />
                        <em style={{ color: 'rgb(241, 71, 34)', fontStyle: 'italic' }}>superior para tu marca.</em>
                    </motion.h1>

                    {/* Body */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.9, delay: 0.3 }}
                        style={{
                            fontFamily: "'DM Sans', sans-serif",
                            fontSize: 15,
                            fontWeight: 300,
                            lineHeight: 1.75,
                            color: '#6b6460',
                            maxWidth: 440,
                            marginBottom: 48,
                        }}
                    >
                        Menú digital → Pedidos takeaway → Pagos online. <br /> Con tu branding, tus colores y la identidad de tu restaurante.
                    </motion.p>

                    {/* CTAs */}
                    <motion.div
                        className="flex flex-col sm:flex-row gap-5 items-start"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.5 }}
                    >
                        <a href="mailto:hola@takeasygo.com">
                            <button
                                style={{
                                    height: 48,
                                    padding: '0 28px',
                                    background: '#0d0b0a',
                                    color: '#f7f4f1',
                                    border: 'none',
                                    borderRadius: 48,
                                    fontFamily: "'DM Sans', sans-serif",
                                    fontSize: 11,
                                    fontWeight: 500,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    boxShadow: '0 2px 12px rgba(13,11,10,0.12)',
                                    transition: 'background 0.25s, transform 0.15s, box-shadow 0.25s',
                                }}
                                onMouseEnter={e => {
                                    const el = e.currentTarget
                                    el.style.background = '#f14722'
                                    el.style.transform = 'translateY(-2px)'
                                    el.style.boxShadow = '0 8px 24px rgba(241,71,34,0.22)'
                                }}
                                onMouseLeave={e => {
                                    const el = e.currentTarget
                                    el.style.background = '#0d0b0a'
                                    el.style.transform = 'translateY(0)'
                                    el.style.boxShadow = '0 2px 12px rgba(13,11,10,0.12)'
                                }}
                            >
                                Comenzar ahora
                                <ArrowRight size={13} />
                            </button>
                        </a>
                    </motion.div>
                </div>
            </section>
        </>
    )
}
'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

const HAND_IMAGE = 'https://res.cloudinary.com/dypcq8lsa/image/upload/v1773025515/ChatGPT_Image_9_mar_2026__12_05_18_a.m.-removebg-preview_jrsctw.png'

const faqs = [
    {
        q: '¿Cómo funciona el programa de fidelización?',
        a: 'Nuestra plataforma automatiza la acumulación de puntos por cada compra, permitiendo a los clientes canjear beneficios directos en tu local, fortaleciendo el vínculo emocional con tu marca.'
    },
    {
        q: '¿Qué tipos de empresas pueden utilizar este sistema?',
        a: 'Desde bares boutique hasta cadenas de restaurantes y dark kitchens. Nuestra flexibilidad permite adaptar el flujo a cualquier modelo operativo gastronómico.'
    },
    {
        q: '¿Qué plan de precios es el adecuado para mi negocio?',
        a: 'Podés empezar con planes mensuales o elegir una Inversión Única para hacerlo parte de tu negocio. Ambos modelos están pensados bajo una misma filosofía: sin comisiones abusivas, sin dependencia, y con tecnología que realmente te pertenece.'
    },
    {
        q: '¿Puedo probar el programa antes de comprometerme?',
        a: 'Sí, ofrecemos demostraciones personalizadas y un periodo de prueba acompañado por nuestro equipo. La demostración es gratuita sin compromiso de continuidad. Nuestro objetivo es simple: asegurarnos de que Takeasygo sea realmente el motor que tu restaurante necesita, antes de que tomes cualquier decisión.'
    }
]

export default function FAQ() {
    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

                /* Chevron del accordion en blanco */
                #faq-section [data-radix-collection-item] svg {
                    color: rgba(247,244,242,0.8);
                }
            `}</style>

            <section
                id="faq-section"
                className="relative overflow-hidden"
                style={{ background: '#f14722', borderRadius: '20px', margin: '20px' }}
            >
                {/* Glow decorativo — igual que en Hero */}
                <div className="absolute pointer-events-none" style={{
                    bottom: '-10%', left: '-5%', width: '50vw', height: '50vw',
                    background: 'radial-gradient(ellipse at 40% 70%, rgba(247,244,243,0.18) 0%, transparent 55%)',
                }} />

                <div className="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12 md:gap-0 px-8 md:px-16 py-20 md:py-28">

                    {/* ── Izquierda: contenido FAQ ─────────────────────────────── */}
                    <div className="flex-1 min-w-0 md:pr-16">

                        {/* Eyebrow */}
                        <div className="flex items-center gap-3 mb-8">
                            <span style={{ width: 28, height: 1, background: 'rgba(247,244,242,0.4)', display: 'block', flexShrink: 0 }} />
                            <span style={{
                                fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                                letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(247,244,242,0.6)',
                            }}>
                                Preguntas frecuentes
                            </span>
                        </div>

                        {/* Título */}
                        <h2 style={{
                            fontFamily: "'DM Serif Display', serif",
                            fontSize: 'clamp(52px, 6vw, 80px)',
                            fontWeight: 400,
                            lineHeight: 1,
                            letterSpacing: '-0.02em',
                            color: '#f7f4f2',
                            marginBottom: 40,
                        }}>
                            FAQ
                        </h2>

                        {/* Acordeón */}
                        <Accordion type="single" collapsible className="w-full">
                            {faqs.map((faq, i) => (
                                <AccordionItem
                                    key={i}
                                    value={`item-${i}`}
                                    className="border-b last:border-b-0"
                                    style={{ borderColor: 'rgba(247,244,242,0.2)' }}
                                >
                                    <AccordionTrigger
                                        className="hover:no-underline text-left py-5 md:py-6 hover:opacity-80 transition-opacity"
                                        style={{
                                            fontFamily: "'DM Sans', sans-serif",
                                            fontSize: 'clamp(14px, 1.6vw, 17px)',
                                            fontWeight: 500,
                                            color: '#f7f4f2',
                                        }}
                                    >
                                        {faq.q}
                                    </AccordionTrigger>
                                    <AccordionContent
                                        className="pb-5 md:pb-6 leading-relaxed"
                                        style={{
                                            fontFamily: "'DM Sans', sans-serif",
                                            fontSize: 14,
                                            fontWeight: 300,
                                            color: 'rgba(247,244,242,0.65)',
                                        }}
                                    >
                                        {faq.a}
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </div>

                    {/* ── Derecha: imagen con entry animation ──────────────────── */}
                    <motion.div
                        className="flex-shrink-0 flex items-end justify-center w-full md:w-auto"
                        initial={{ y: 70, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        viewport={{ once: true, amount: 0.25 }}
                        transition={{ duration: 1.1, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                        <Image
                            src={HAND_IMAGE}
                            alt="TakeasyGO app en mano"
                            width={520}
                            height={600}
                            style={{
                                width: 'clamp(220px, 32vw, 480px)',
                                height: 'auto',
                                display: 'block',
                            }}
                            unoptimized
                        />
                    </motion.div>

                </div>
            </section>
        </>
    )
}

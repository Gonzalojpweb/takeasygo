'use client'

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

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
        a: 'Sí, ofrecemos demostraciones personalizadas y un periodo de prueba acompañado por nuestro equipo.Este proceso tiene un costo mínimo, que nos permite garantizar una implementación correcta, asistencia dedicada y un uso real de la plataforma durante la prueba. Al finalizar el periodo, reintegrás el 30% del monto abonado, sin compromiso de continuidad. Nuestro objetivo es simple: asegurarnos de que Takeasygo sea realmente el motor que tu restaurante necesita, antes de que tomes cualquier decisión.'
    }
]

export default function FAQ() {
    return (
        <section className="bg-zinc-50/50 py-20 md:py-32 px-5 md:px-6 border-t border-zinc-100">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-10 md:gap-20">
                <div className="w-full md:w-1/3">
                    <h2 className="text-6xl md:text-8xl font-bold text-zinc-900 tracking-tighter opacity-50">FAQ</h2>
                </div>

                <div className="w-full md:w-2/3">
                    <Accordion type="single" collapsible className="w-full space-y-3 md:space-y-4">
                        {faqs.map((faq, i) => (
                            <AccordionItem
                                key={i}
                                value={`item-${i}`}
                                className="bg-white border rounded-2xl md:rounded-[1.5rem] px-5 md:px-8 border-zinc-100 shadow-sm overflow-hidden"
                            >
                                <AccordionTrigger className="text-zinc-900 font-bold text-left text-sm md:text-base hover:no-underline py-5 md:py-6">
                                    {faq.q}
                                </AccordionTrigger>
                                <AccordionContent className="text-zinc-500 font-medium leading-relaxed pb-5 md:pb-6 text-sm">
                                    {faq.a}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </div>
        </section>
    )
}

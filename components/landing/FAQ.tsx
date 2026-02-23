'use client'

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
    {
        q: 'How does the loyalty program work?',
        a: 'Nuestra plataforma automatiza la acumulación de puntos por cada compra, permitiendo a los clientes canjear beneficios directos en tu local, fortaleciendo el vínculo emocional con tu marca.'
    },
    {
        q: 'What types of businesses can use this system?',
        a: 'Desde bares boutique hasta cadenas de restaurantes y dark kitchens. Nuestra flexibilidad permite adaptar el flujo a cualquier modelo operativo gastronómico.'
    },
    {
        q: 'Which pricing plan is right for my business?',
        a: 'Si buscas escalabilidad con una inversión inicial baja, los planes mensuales son ideales. Para consolidar el sistema como un activo propio de tu empresa, recomendamos el modelo de Inversión Única.'
    },
    {
        q: 'Can I try the program before committing?',
        a: 'Sí, ofrecemos demostraciones personalizadas y periodos de prueba asistidos para asegurar que Takeasygo sea el motor que tu restaurante necesita.'
    }
]

export default function FAQ() {
    return (
        <section className="bg-zinc-50/50 py-32 px-6 border-t border-zinc-100">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-20">
                <div className="w-full md:w-1/3">
                    <h2 className="text-6xl md:text-8xl font-bold text-zinc-900 tracking-tighter opacity-10">FAQ</h2>
                </div>

                <div className="w-full md:w-2/3">
                    <Accordion type="single" collapsible className="w-full space-y-4">
                        {faqs.map((faq, i) => (
                            <AccordionItem key={i} value={`item-${i}`} className="bg-white border rounded-[1.5rem] px-8 border-zinc-100 shadow-sm overflow-hidden">
                                <AccordionTrigger className="text-zinc-900 font-bold text-left hover:no-underline py-6">
                                    {faq.q}
                                </AccordionTrigger>
                                <AccordionContent className="text-zinc-500 font-medium leading-relaxed pb-6">
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

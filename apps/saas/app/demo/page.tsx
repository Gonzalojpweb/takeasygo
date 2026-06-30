import type { Metadata } from 'next'
import Image from 'next/image'
import DemoForm from './DemoForm'

export const metadata: Metadata = {
    title: 'Demo Gratuita | Takeasygo',
    description: 'Solicitá tu demo personalizada y descubrí cómo Takeasygo transforma tu restaurante.',
}

interface DemoPageProps {
    searchParams: Promise<{ canal?: string }>
}

export default async function DemoPage({ searchParams }: DemoPageProps) {
    const { canal } = await searchParams

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-16">

            {/* Logo */}
            <a href="https://takeasygo.com" target="_blank" rel="noopener noreferrer" className="mb-12 opacity-90 hover:opacity-100 transition-opacity">
                <Image
                    src="https://res.cloudinary.com/dypcq8lsa/image/upload/v1773077771/ChatGPT_Image_9_mar_2026__02_28_19_p.m.-removebg-preview-removebg-preview_1_yrwjdm.png"
                    alt="Takeasygo"
                    width={160}
                    height={40}
                    style={{ height: 36, width: 'auto' }}
                    unoptimized
                />
            </a>

            {/* Card */}
            <div className="w-full max-w-md">

                {/* Header */}
                <div className="text-center mb-10">
                    <h1 className="text-3xl md:text-4xl font-bold text-zinc-900 tracking-tight mb-3">
                        Solicitá tu Demo Gratuita
                    </h1>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                        Completá el formulario y te contactamos para agendar una demo personalizada.
                    </p>
                </div>

                {/* Form */}
                <DemoForm canal={canal} />

            </div>

            {/* Footer mínimo */}
            <p className="mt-16 text-[10px] text-zinc-300 font-bold tracking-[0.2em] uppercase">
                © 2026 Takeasygo — Sophisticated Dining Tech
            </p>

        </div>
    )
}

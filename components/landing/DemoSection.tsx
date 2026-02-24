'use client'

import { Button } from '@/components/ui/button'

const demoImages = [
    'https://images.unsplash.com/photo-1517248135467-4c7ed9d73c7a?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=2074&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1590650153855-d9e808231d41?q=80&w=2070&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2015&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=2070&auto=format&fit=crop'
]

export default function DemoSection() {
    return (
        <section id="demo" className="bg-white py-20 md:py-32 overflow-hidden border-t border-zinc-100">
            <div className="max-w-7xl mx-auto px-5 md:px-6 mb-14 md:mb-24 text-center">
                <h2 className="text-4xl md:text-7xl font-bold text-zinc-900 tracking-tight mb-4 md:mb-6">
                    Solicita Demo
                </h2>
                <p className="text-zinc-400 text-base md:text-xl font-medium">
                    Aumenta la fidelidad. Impulsa las ventas.
                </p>

                {/* Form — stacks to single column on mobile */}
                <div className="mt-10 md:mt-20 max-w-5xl mx-auto flex flex-col md:flex-row flex-wrap gap-5 md:gap-8 items-stretch md:items-end justify-center">
                    <div className="flex flex-col gap-2 w-full md:min-w-[200px] md:flex-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1 text-left">
                            Name
                        </label>
                        <input
                            type="text"
                            className="bg-transparent border-b border-zinc-200 py-3 focus:outline-none focus:border-zinc-900 transition-colors placeholder:text-zinc-200"
                        />
                    </div>
                    <div className="flex flex-col gap-2 w-full md:min-w-[200px] md:flex-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1 text-left">
                            Business Name
                        </label>
                        <input
                            type="text"
                            className="bg-transparent border-b border-zinc-200 py-3 focus:outline-none focus:border-zinc-900 transition-colors placeholder:text-zinc-200"
                        />
                    </div>
                    <div className="flex flex-col gap-2 w-full md:min-w-[200px] md:flex-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1 text-left">
                            Email
                        </label>
                        <input
                            type="email"
                            className="bg-transparent border-b border-zinc-200 py-3 focus:outline-none focus:border-zinc-900 transition-colors placeholder:text-zinc-200"
                        />
                    </div>
                    <div className="flex flex-col gap-2 w-full md:min-w-[200px] md:flex-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1 text-left">
                            Phone
                        </label>
                        <input
                            type="tel"
                            className="bg-transparent border-b border-zinc-200 py-3 focus:outline-none focus:border-zinc-900 transition-colors placeholder:text-zinc-200"
                        />
                    </div>
                    <Button className="w-full md:w-auto bg-zinc-900 text-white rounded-full px-10 md:px-12 h-14 font-bold uppercase tracking-widest text-[11px] shadow-xl hover:bg-zinc-800 transition-all mt-2 md:mt-0">
                        Submit
                    </Button>
                </div>
            </div>

            {/* Horizontal image gallery — touch-scrollable */}
            <div className="flex gap-4 md:gap-6 pl-5 md:px-6 no-scrollbar overflow-x-auto pb-6 md:pb-10">
                {demoImages.map((src, i) => (
                    <div
                        key={i}
                        className="min-w-[240px] md:min-w-[300px] h-[160px] md:h-[200px] rounded-2xl md:rounded-3xl overflow-hidden border border-zinc-100 shadow-sm flex-shrink-0"
                    >
                        <img
                            src={src}
                            alt="Happy clients"
                            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                            loading="lazy"
                        />
                    </div>
                ))}
            </div>
        </section>
    )
}

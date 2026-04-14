'use client'

import { ShoppingBag, LayoutDashboard, ChevronRight } from 'lucide-react'
import { BlurFade } from '@/components/ui/blur-fade'
import Link from 'next/link'

export default function ExperienceDemos() {
  return (
    <section className="bg-zinc-950 py-24 md:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        
        {/* Header */}
        <div className="max-w-3xl mb-16 md:mb-24">
          <BlurFade delay={0.1}>
            <span className="text-orange-500 font-bold text-[10px] tracking-[0.3em] uppercase mb-4 block">
              Producto en acción
            </span>
            <h2 className="text-white text-4xl md:text-6xl font-bold tracking-tight mb-8">
              Una experiencia fluida, <br />
              <span className="text-zinc-500">desde ambos lados.</span>
            </h2>
          </BlurFade>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-start">
          
          {/* Consumer Demo */}
          <BlurFade delay={0.2} className="space-y-8">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                <ShoppingBag className="text-orange-500 w-6 h-6" />
              </div>
              <h3 className="text-white text-2xl font-bold">Para tus clientes</h3>
              <p className="text-zinc-400 text-base leading-relaxed max-w-md">
                Un menú digital diseñado para convertir. Sin fricción, con pagos integrados y una estética premium que resalta la calidad de tus platos.
              </p>
            </div>
            
            {/* Phone Mockup */}
            <div className="relative mx-auto lg:mx-0 w-full max-w-[300px] aspect-[9/19.5] rounded-[3rem] border-[8px] border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-6 bg-zinc-800 rounded-b-2xl z-20" />
              <img 
                src="/demos/consumer-flow.webp" 
                alt="Customer Demo" 
                className="w-full h-full object-cover"
                loading="eager"
              />
            </div>
          </BlurFade>

          {/* Admin Demo */}
          <BlurFade delay={0.3} className="space-y-8 lg:pt-32">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <LayoutDashboard className="text-blue-500 w-6 h-6" />
              </div>
              <h3 className="text-white text-2xl font-bold">Para tu negocio</h3>
              <p className="text-zinc-400 text-base leading-relaxed max-w-md">
                Gestión operativa sin complicaciones. Controlá pedidos, analizá tu consistencia operativa (ICO) y tomá decisiones basadas en datos reales.
              </p>
            </div>

            {/* Tablet/Desktop Mockup */}
            <div className="relative w-full aspect-[16/10] rounded-2xl border-[6px] border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden">
              <img 
                src="/demos/business-flow.webp" 
                alt="Dashboard Demo" 
                className="w-full h-full object-cover"
                loading="eager"
              />
            </div>
          </BlurFade>

        </div>

        {/* Bottom CTA */}
        <div className="mt-20 pt-10 border-t border-zinc-900 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              {[1,2,3].map(i => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-zinc-950 bg-zinc-800 overflow-hidden">
                  <img 
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 14}`} 
                    alt="User"
                    className="w-full h-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=User+${i}&background=333&color=fff`;
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
              +100 restaurantes ya operan con esta tecnología.
            </p>
          </div>
          <Link href="/#pricing" className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-widest group">
            Empezar ahora <ChevronRight className="w-4 h-4 text-orange-500 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  )
}

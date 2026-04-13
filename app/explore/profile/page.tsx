'use client'

import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { LogOut, User, Settings, ShoppingBag, Heart, ChevronRight, LogIn } from 'lucide-react'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { BlurFade } from '@/components/ui/blur-fade'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text'
import BottomNav from '@/components/explore/BottomNav'

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const loading = status === 'loading'

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[var(--c-bg)] items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#f14722]/20 border-t-[#f14722] animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--c-bg)] consumer-dark overflow-y-auto pb-24">
      
      {!session ? (
        /* ── LOGIN VIEW ─────────────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#f14722]/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-emerald-500/5 blur-[100px] rounded-full" />

          <BlurFade delay={0.1}>
            <div className="w-20 h-20 bg-[var(--c-surface)] rounded-3xl flex items-center justify-center mb-6 border border-[var(--c-border)] relative group">
              <BorderBeam size={80} duration={8} />
              <User size={32} className="text-[#f14722]" />
            </div>
          </BlurFade>

          <BlurFade delay={0.2}>
            <h1 className="text-2xl font-bold text-[#f7f4f2] text-center mb-2">
              Tu perfil Gastronómico
            </h1>
            <p className="text-[#5a524d] text-sm text-center mb-8 max-w-[280px]">
              Iniciá sesión para guardar tus favoritos, ver tu historial y gestionar tus pedidos.
            </p>
          </BlurFade>

          <BlurFade delay={0.3} className="w-full max-w-[320px]">
            <ShimmerButton
              onClick={() => signIn('google')}
              className="w-full flex items-center justify-center gap-3 py-3 !bg-white !text-zinc-900 font-bold"
            >
              <Image 
                src="https://www.google.com/favicon.ico" 
                alt="Google" 
                width={18} 
                height={18} 
                className="shrink-0"
              />
              Continuar con Google
            </ShimmerButton>
          </BlurFade>

          <BlurFade delay={0.4} className="mt-8">
            <p className="text-[11px] text-[#5a524d] text-center">
              Al continuar, aceptás nuestros <br /> 
              <span className="text-[#8a7f7a] underline">Términos y condiciones</span>
            </p>
          </BlurFade>
        </div>
      ) : (
        /* ── PROFILE VIEW ────────────────────────────────────────── */
        <div className="flex-1 p-6 animate-fade-in-up">
          {/* User Header */}
          <div className="relative glass-card rounded-3xl p-6 mb-8 overflow-hidden">
            <BorderBeam size={200} duration={12} colorFrom="#f14722" colorTo="#f14722" />
            
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[var(--c-border)] shrink-0">
                {session.user?.image ? (
                  <Image src={session.user.image} alt={session.user.name || ''} width={64} height={64} />
                ) : (
                  <div className="w-full h-full bg-[var(--c-bg)] flex items-center justify-center">
                    <User size={24} className="text-[#5a524d]" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-[#f7f4f2] text-lg font-bold truncate">
                  {session.user?.name}
                </h2>
                <p className="text-[#5a524d] text-xs truncate">
                  {session.user?.email}
                </p>
                <div className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full bg-[#f14722]/10 border border-[#f14722]/20">
                  <div className="w-1 h-1 rounded-full bg-[#f14722]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#f14722]">
                    Cliente {session.user?.role || 'Consumer'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions List */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#5a524d] ml-1 mb-2">
              Actividad
            </h3>
            
            <button className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 group hover:border-[var(--c-border-active)] transition-all">
              <div className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center text-[#f14722]">
                <ShoppingBag size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-[#f7f4f2]">Mis Pedidos</p>
                <p className="text-[10px] text-[#5a524d]">Historial y seguimiento</p>
              </div>
              <ChevronRight size={16} className="text-[#5a524d] group-hover:translate-x-1 transition-transform" />
            </button>

            <button className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 group hover:border-[var(--c-border-active)] transition-all">
              <div className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center text-emerald-500">
                <Heart size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-[#f7f4f2]">Favoritos</p>
                <p className="text-[10px] text-[#5a524d]">Tus lugares preferidos</p>
              </div>
              <ChevronRight size={16} className="text-[#5a524d] group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="h-4" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#5a524d] ml-1 mb-2">
              Configuración
            </h3>

            <button className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 group hover:border-[var(--c-border-active)] transition-all">
              <div className="w-10 h-10 rounded-xl bg-[var(--c-surface)] flex items-center justify-center text-[#8a7f7a]">
                <Settings size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-[#f7f4f2]">Mi Cuenta</p>
                <p className="text-[10px] text-[#5a524d]">Preferencias y datos</p>
              </div>
              <ChevronRight size={16} className="text-[#5a524d] group-hover:translate-x-1 transition-transform" />
            </button>

            <button 
              onClick={() => signOut()}
              className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 group border-red-500/10 hover:border-red-500/30 transition-all mt-8"
            >
              <div className="w-10 h-10 rounded-xl bg-red-500/5 flex items-center justify-center text-red-500">
                <LogOut size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-red-500/80">Cerrar Sesión</p>
              </div>
            </button>
          </div>
        </div>
      )}

      <BottomNav activeView="profile" />
    </div>
  )
}

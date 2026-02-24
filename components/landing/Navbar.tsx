'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navLinks = [
    { name: 'Qué hacemos', href: '#what-we-do' },
    { name: 'Cómo trabajamos', href: '#how-we-work' },
    { name: 'Funcionalidades', href: '#features' },
    { name: 'Precios', href: '#pricing' },
]

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20)
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const scrollToTop = (e: React.MouseEvent) => {
        e.preventDefault()
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    return (
        <nav
            className={cn(
                'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
                scrolled
                    ? 'bg-white/80 backdrop-blur-md border-b border-zinc-100 py-3'
                    : 'bg-transparent py-5'
            )}
        >
            <div className="max-w-7xl mx-auto px-6 md:px-10 flex items-center justify-between">

                {/* Logo — always visible */}
                <Link href="/" onClick={scrollToTop} className="flex items-center gap-2 group">
                    <div className="w-7 h-7 bg-zinc-900 rounded-md flex items-center justify-center transition-transform duration-300">
                        <span className="text-white font-bold text-sm italic">T</span>
                    </div>
                    <span className="text-zinc-900 font-bold text-lg tracking-tight">Takeasygo</span>
                </Link>

                {/* Desktop: full nav links + login */}
                <div className="hidden md:flex items-center gap-10">
                    {navLinks.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            className="text-zinc-500 hover:text-zinc-900 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors"
                        >
                            {link.name}
                        </a>
                    ))}
                    <Link href="/login">
                        <Button variant="ghost" className="text-zinc-900 font-bold border border-zinc-200 hover:bg-[#f14722] hover:text-white rounded-full px-6 transition-all h-9 text-[11px] uppercase tracking-wider">
                            Iniciar Sesión
                        </Button>
                    </Link>
                </div>

                {/* Mobile: only login button */}
                <Link href="/login" className="md:hidden">
                    <Button
                        size="sm"
                        className="bg-zinc-900 text-white rounded-full px-5 h-9 text-[10px] font-bold uppercase tracking-wider hover:bg-[#f14722] transition-all"
                    >
                        Iniciar Sesión
                    </Button>
                </Link>

            </div>
        </nav>
    )
}

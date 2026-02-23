'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
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
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20)
        }
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
            <div className="max-w-7xl mx-auto px-10 flex items-center justify-between">
                <Link href="/" onClick={scrollToTop} className="flex items-center gap-2 group">
                    <div className="w-7 h-7 bg-zinc-900 rounded-md flex items-center justify-center transition-transform duration-300">
                        <span className="text-white font-bold text-sm italic">T</span>
                    </div>
                    <span className="text-zinc-900 font-bold text-lg tracking-tight">Takeasygo</span>
                </Link>

                {/* Desktop Links */}
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

                {/* Mobile Toggle */}
                <button
                    className="md:hidden text-zinc-900"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                    {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
            </div>

            {/* Mobile Menu */}
            <div className={cn(
                "fixed inset-0 bg-white z-40 flex flex-col items-center justify-center gap-6 transition-all duration-500 md:hidden",
                mobileMenuOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
            )}>
                {navLinks.map((link) => (
                    <a
                        key={link.name}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-zinc-900 text-xl font-bold uppercase tracking-widest"
                    >
                        {link.name}
                    </a>
                ))}
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="bg-zinc-900 text-white rounded-full px-10 py-5 text-sm font-bold uppercase tracking-widest">
                        Iniciar Sesión
                    </Button>
                </Link>
            </div>
        </nav>
    )
}

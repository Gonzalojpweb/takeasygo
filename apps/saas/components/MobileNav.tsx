'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

interface Props {
    children: React.ReactNode
    title?: string
}

export default function MobileNav({ children, title = 'Menu Platform' }: Props) {
    const [open, setOpen] = useState(false)
    const pathname = usePathname()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        setOpen(false)
    }, [pathname])

    const handleContentClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('a[href]')) {
            setOpen(false)
        }
    }

    if (!mounted) {
        return (
            <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <h1 className="text-foreground font-bold text-lg tracking-tight">{title}</h1>
                </div>
            </header>
        )
    }

    return (
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-30">
            <div className="flex items-center gap-3">
                <h1 className="text-foreground font-bold text-lg tracking-tight">{title}</h1>
            </div>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground group">
                        <Menu size={24} className="group-hover:scale-110 transition-transform" />
                    </Button>
                </SheetTrigger>
                <SheetContent
                    side="left"
                    className="p-0 w-72 border-r border-border bg-sidebar animate-in slide-in-from-left duration-300 data-[state=closed]:duration-0 data-[state=closed]:animate-none"
                    onClick={handleContentClick}
                >
                    <div className="sr-only">
                        <SheetTitle>Navegación Móvil</SheetTitle>
                        <SheetDescription>Accede a las diferentes secciones del panel administrativo.</SheetDescription>
                    </div>
                    {children}
                </SheetContent>
            </Sheet>
        </header>
    )
}

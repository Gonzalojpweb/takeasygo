'use client'

import { ReactNode, useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

interface SmoothScrollProps {
    children: ReactNode
}

export default function SmoothScroll({ children }: SmoothScrollProps) {
    useEffect(() => {
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            touchMultiplier: 2,
            infinite: false,
        })

        document.documentElement.style.scrollBehavior = 'auto'

        function raf(time: number) {
            lenis.raf(time)
            requestAnimationFrame(raf)
        }

        requestAnimationFrame(raf)

        lenis.on('scroll', ScrollTrigger.update)

        gsap.ticker.add((time) => {
            lenis.raf(time * 1000)
        })

        gsap.ticker.lagSmoothing(0)

        const handleWheel = (e: WheelEvent) => {
            const target = e.target as HTMLElement
            const preventEl = target.closest('[data-lenis-prevent]')
            if (preventEl) {
                e.stopImmediatePropagation()
            }
        }

        document.addEventListener('wheel', handleWheel, { passive: false, capture: true })

        return () => {
            lenis.destroy()
            gsap.ticker.remove(raf)
            document.removeEventListener('wheel', handleWheel, { capture: true })
        }
    }, [])

    return <>{children}</>
}

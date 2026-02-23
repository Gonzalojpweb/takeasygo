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

        // Webkit fix for scroll-behavior: smooth conflict
        document.documentElement.style.scrollBehavior = 'auto'

        function raf(time: number) {
            lenis.raf(time)
            requestAnimationFrame(raf)
        }

        requestAnimationFrame(raf)

        // Connect Lenis to GSAP ScrollTrigger
        lenis.on('scroll', ScrollTrigger.update)

        gsap.ticker.add((time) => {
            lenis.raf(time * 1000)
        })

        gsap.ticker.lagSmoothing(0)

        return () => {
            lenis.destroy()
            gsap.ticker.remove(raf)
        }
    }, [])

    return <>{children}</>
}

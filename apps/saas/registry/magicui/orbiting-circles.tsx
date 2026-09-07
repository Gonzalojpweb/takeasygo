'use client'

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface OrbitingCirclesProps {
  children: ReactNode
  className?: string
  iconSize?: number
  radius?: number
  speed?: number
  reverse?: boolean
}

export function OrbitingCircles({
  children,
  className,
  iconSize = 40,
  radius = 160,
  speed = 1,
  reverse = false,
}: OrbitingCirclesProps) {
  const duration = 20 / speed
  const childArray = Array.isArray(children) ? children : [children]
  const count = childArray.length

  return (
    <div
      className={cn('relative', className)}
      style={{ width: radius * 2 + iconSize, height: radius * 2 + iconSize }}
    >
      {childArray.map((child, i) => {
        const angle = (360 / count) * i
        return (
          <div
            key={i}
            className="absolute top-0 left-1/2"
            style={{
              width: radius * 2 + iconSize,
              height: radius * 2 + iconSize,
              animation: `tgo-orbit ${duration}s linear infinite ${reverse ? 'reverse' : 'normal'}`,
              transformOrigin: 'center center',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                width: iconSize,
                height: iconSize,
                marginLeft: -iconSize / 2,
                transform: `rotate(${angle}deg) translateY(-${radius}px) rotate(-${angle}deg)`,
              }}
            >
              {child}
            </div>
          </div>
        )
      })}
    </div>
  )
}

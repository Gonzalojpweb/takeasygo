'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface PromoHeaderProps {
  badgeLabel?: string
  title: string
  accentColor?: string
  imageUrl?: string
}

export function PromoHeader({ badgeLabel, title, accentColor = '#F74211', imageUrl }: PromoHeaderProps) {
  return (
    <div
      className="px-6 pt-6 pb-8 text-center relative overflow-hidden"
      style={{ backgroundColor: accentColor }}
    >
      {imageUrl ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6"
        >
          <div
            className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center mx-auto"
            style={{ backgroundColor: `${accentColor}10` }}
          >
            <img
              src={imageUrl}
              alt="Promo"
              className="w-full h-full object-cover"
            />
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6"
        >
          <div
            className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center mx-auto"
            style={{ backgroundColor: `${accentColor}10` }}
          >
            <img
              src="/tgoicon-192.png"
              alt="TakeAsyGo"
              className="w-12 h-12 object-contain"
            />
          </div>
        </motion.div>
      )}

      {badgeLabel && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3"
          style={{ color: 'rgba(255, 255, 255, 0.8)' }}
        >
          {badgeLabel}
        </motion.p>
      )}

      <motion.h3
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-2xl font-black leading-tight tracking-tight min-w-[90%] mx-auto"
        style={{ fontFamily: 'var(--tgo-type-section)', color: '#FFFFFF' }}
      >
        {renderTitle(title)}
      </motion.h3>
    </div>
  )
}

function renderTitle(title: string): ReactNode {
  if (!title) return ''
  const dotIndex = title.indexOf('.')
  if (dotIndex > 0 && dotIndex < title.length - 1) {
    const first = title.substring(0, dotIndex + 1)
    const second = title.substring(dotIndex + 1)
    return (
      <>
        {first}
        <br />
        <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{second.trim()}</span>
      </>
    )
  }
  const matchWord = ' y ganá '
  const matchIndex = title.toLowerCase().indexOf(matchWord)
  if (matchIndex > 0) {
    const first = title.substring(0, matchIndex)
    const second = title.substring(matchIndex)
    return (
      <>
        {first}
        <br />
        <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{second.trim()}</span>
      </>
    )
  }
  return title
}

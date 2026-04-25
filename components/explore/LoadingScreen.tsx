'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export default function LoadingScreen() {
  const [isVisible, setIsVisible] = useState(true)

  // Use this component as a splash screen that fades out
  // In a real scenario, you might want to call this based on a state
  
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#f74211]"
    >
      <div className="relative flex flex-col items-center gap-6">
        {/* Animated Logo Container */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            duration: 1.2,
            ease: [0.16, 1, 0.3, 1], // Custom cubic-bezier for premium feel
          }}
          className="w-24 h-24 bg-white rounded-[24px] flex items-center justify-center shadow-2xl"
        >
          <span className="text-[#f74211] font-serif italic text-5xl font-black select-none">
            T
          </span>
          
          {/* Subtle outer glow pulse */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute inset-0 bg-white rounded-[24px] -z-10 blur-xl"
          />
        </motion.div>

        {/* Brand Name */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="flex flex-col items-center"
        >
          <h1 className="text-white font-sans text-xl font-bold tracking-tight">
            Takeasygo
          </h1>
          <p className="text-white/60 text-[10px] uppercase tracking-[0.2em] font-medium mt-1">
            Red Gastronómica
          </p>
        </motion.div>
      </div>

      {/* Bottom loading indicator */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="absolute bottom-16 flex flex-col items-center gap-3"
      >
        <div className="w-12 h-[2px] bg-white/20 rounded-full overflow-hidden">
          <motion.div
            animate={{ x: [-48, 48] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "linear"
            }}
            className="w-full h-full bg-white"
          />
        </div>
      </motion.div>
    </motion.div>
  )
}

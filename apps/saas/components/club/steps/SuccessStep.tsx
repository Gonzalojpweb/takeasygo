'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, Sparkles, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface SuccessStepProps {
  tenantSlug: string
  accentColor: string
  welcomePoints: number
  successTitle?: string
  successMessage?: string
  welcomePointsMsg?: string
  onClose: () => void
}

export default function SuccessStep({
  tenantSlug,
  accentColor,
  welcomePoints,
  successTitle = '¡Registro exitoso!',
  successMessage = 'Bienvenido al club de fidelización',
  welcomePointsMsg = '{points} puntos de bienvenida',
  onClose,
}: SuccessStepProps) {
  const router = useRouter()

  return (
    <div className="flex flex-col items-center justify-center py-8 px-2">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <CheckCircle2
          size={72}
          style={{ color: 'var(--tgo-state-success, #16A34A)' }}
          strokeWidth={1.5}
        />
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-2xl font-bold mt-6 mb-2 text-center"
        style={{ fontFamily: 'var(--tgo-type-section)', color: 'var(--tgo-text-primary, #1A1A1A)' }}
      >
        {successTitle}
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="text-base text-center mb-4"
        style={{ color: 'var(--tgo-text-secondary, #6B6560)', fontFamily: 'var(--tgo-type-body)' }}
      >
        {successMessage}
      </motion.p>

      {welcomePoints > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl mb-8"
          style={{
            backgroundColor: `${accentColor}10`,
            border: `1px solid ${accentColor}30`,
            color: accentColor,
          }}
        >
          <Sparkles size={16} />
          <span className="text-sm font-semibold">
            {welcomePointsMsg.replace('{points}', String(welcomePoints))}
          </span>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="w-full space-y-3"
      >
        <button
          onClick={() => {
            router.push(`/${tenantSlug}/club/lookup`)
            onClose()
          }}
          className="w-full h-12 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.985]"
          style={{
            backgroundColor: accentColor,
            boxShadow: `0 8px 20px -4px ${accentColor}55`,
          }}
        >
          <Wallet size={18} />
          Ir a mi billetera
        </button>

        <button
          onClick={onClose}
          className="w-full text-sm font-medium transition-colors py-2"
          style={{ color: 'var(--tgo-text-muted, #A09A95)' }}
        >
          Ahora no
        </button>
      </motion.div>
    </div>
  )
}

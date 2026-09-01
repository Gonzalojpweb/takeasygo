'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, X, Send, CheckCircle2 } from 'lucide-react'
import confetti from 'canvas-confetti'

interface OrderItem {
  _id: string
  name: string
  quantity: number
  menuItemId?: string
}

interface Props {
  open: boolean
  onClose: () => void
  items: OrderItem[]
  orderId: string
  ratingToken: string
  tenantSlug: string
  tenantName: string
  primaryColor: string
}

interface ItemState {
  liked: boolean
  likesCount: number
  loading: boolean
}

export default function LikeOrderItemsModal({
  open,
  onClose,
  items,
  orderId,
  ratingToken,
  tenantSlug,
  tenantName,
  primaryColor,
}: Props) {
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({})
  const [sent, setSent] = useState(false)
  const [loadingAll, setLoadingAll] = useState(true)

  const likeableItems = items.filter((it) => it.menuItemId)

  useEffect(() => {
    if (!open || likeableItems.length === 0) return
    setLoadingAll(true)
    const fetchAll = likeableItems.map(async (it) => {
      try {
        const res = await fetch(
          `/api/${tenantSlug}/menu/items/${it.menuItemId}/like?orderId=${orderId}&token=${ratingToken}`
        )
        if (res.ok) {
          const data = await res.json()
          return { id: it._id, liked: data.liked, likesCount: data.likesCount }
        }
      } catch {}
      return { id: it._id, liked: false, likesCount: 0 }
    })
    Promise.all(fetchAll).then((results) => {
      const map: Record<string, ItemState> = {}
      for (const r of results) {
        map[r.id] = { liked: r.liked, likesCount: r.likesCount, loading: false }
      }
      setItemStates(map)
      setLoadingAll(false)
    })
  }, [open, likeableItems, orderId, ratingToken, tenantSlug])

  const toggleLike = useCallback(
    async (item: OrderItem) => {
      const id = item._id
      const current = itemStates[id]
      if (!current || current.loading || !item.menuItemId) return

      setItemStates((prev) => ({ ...prev, [id]: { ...prev[id], loading: true } }))

      const isLiked = current.liked
      try {
        const res = await fetch(`/api/${tenantSlug}/menu/items/${item.menuItemId}/like`, {
          method: isLiked ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, token: ratingToken }),
        })
        if (res.ok) {
          const data = await res.json()
          setItemStates((prev) => ({
            ...prev,
            [id]: { liked: data.liked, likesCount: data.likesCount, loading: false },
          }))
        } else {
          setItemStates((prev) => ({ ...prev, [id]: { ...prev[id], loading: false } }))
        }
      } catch {
        setItemStates((prev) => ({ ...prev, [id]: { ...prev[id], loading: false } }))
      }
    },
    [itemStates, orderId, ratingToken, tenantSlug]
  )

  const fireConfetti = useCallback(() => {
    const end = Date.now() + 800
    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 90,
        spread: 100,
        origin: { x: 0.5, y: 0.6 },
        colors: [primaryColor, '#facc15', '#34d399', '#f97316', '#ef4444'],
        gravity: 0.9,
        scalar: 1.1,
      })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }, [primaryColor])

  const likedCount = Object.values(itemStates).filter((s) => s.liked).length
  const allLiked = likedCount === likeableItems.length && likeableItems.length > 0

  const handleSend = () => {
    fireConfetti()
    setSent(true)
  }

  const handleClose = () => {
    setSent(false)
    onClose()
  }

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          >
            {/* Handle bar (mobile) */}
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-zinc-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div>
                <h3 className="font-bold text-lg">Tus platos</h3>
                <p className="text-xs opacity-50">
                  {likedCount > 0
                    ? `${likedCount} de ${likeableItems.length} likeados`
                    : '¿Cuáles te gustaron?'}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors"
              >
                <X size={16} className="text-zinc-500" />
              </button>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2">
              {likeableItems.map((item, idx) => {
                const state = itemStates[item._id]
                const liked = state?.liked ?? false
                const loading = state?.loading ?? false
                const likesCount = state?.likesCount ?? 0

                return (
                  <motion.div
                    key={item._id}
                    className="flex items-center justify-between py-3 px-4 rounded-2xl border transition-colors"
                    style={{
                      backgroundColor: liked ? primaryColor + '08' : '#f9fafb',
                      borderColor: liked ? primaryColor + '30' : '#e5e7eb',
                    }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.25 }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      {item.quantity > 1 && (
                        <p className="text-xs opacity-40">x{item.quantity}</p>
                      )}
                    </div>

                    <button
                      onClick={() => toggleLike(item)}
                      disabled={loading || !item.menuItemId}
                      className="flex items-center gap-1.5 ml-3 py-2 px-3 rounded-xl transition-all active:scale-95 disabled:opacity-40"
                      style={{
                        backgroundColor: liked ? primaryColor + '15' : 'transparent',
                      }}
                    >
                      <Heart
                        size={20}
                        className={loading ? 'animate-pulse' : 'transition-colors'}
                        style={{ color: liked ? '#ef4444' : primaryColor + '50' }}
                        fill={liked ? '#ef4444' : 'transparent'}
                        strokeWidth={2}
                      />
                      {likesCount > 0 && (
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{ color: liked ? '#ef4444' : primaryColor + '60' }}
                        >
                          {likesCount}
                        </span>
                      )}
                    </button>
                  </motion.div>
                )
              })}

              {loadingAll && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: primaryColor + '30', borderTopColor: primaryColor }} />
                </div>
              )}

              {likeableItems.length === 0 && !loadingAll && (
                <p className="text-center py-8 text-sm opacity-40">
                  No hay platos para likear
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-2 space-y-3">
              {!sent ? (
                <button
                  onClick={handleSend}
                  disabled={likedCount === 0}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-30"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Send size={16} />
                  Enviar likes
                </button>
              ) : (
                <motion.div
                  className="text-center space-y-3 py-2"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
                  >
                    <CheckCircle2 size={48} className="mx-auto" style={{ color: primaryColor }} />
                  </motion.div>
                  <p className="font-bold text-base">Gracias por tus likes!</p>
                  <p className="text-xs opacity-50 leading-relaxed">
                    No olvides de dejar tu reseña en Google
                    <br />
                    así ayuda a <span className="font-bold" style={{ color: primaryColor }}>{tenantName}</span> a seguir creciendo.
                  </p>
                  <button
                    onClick={handleClose}
                    className="py-2.5 px-6 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80"
                    style={{ backgroundColor: primaryColor + '10', color: primaryColor }}
                  >
                    Cerrar
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

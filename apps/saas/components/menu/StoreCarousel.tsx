'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Phone } from 'lucide-react'
import { cloudinaryUrl, cloudinaryBlurUrl } from '@/lib/utils'
import { trackRewardViewed } from '@/lib/track'

interface StoreItem {
  _id: string
  name: string
  imageUrl: string
  pointsCost: number
  isFeatured: boolean
}

/** Miembro identificado inline desde el carrusel (lookup por celular). */
export interface IdentifiedMember {
  name: string
  points: number
  joinedAt?: string
  countryCode: string
  phoneDigits: string
}

interface Props {
  tenantSlug: string
  memberPoints: number
  locationId?: string
  /** Si el tenant habilitó "agregar recompensas al carrito desde el menú". */
  rewardEnabled?: boolean
  /** Puntos disponibles para canjear (saldo del club menos lo ya comprometido en el carrito). */
  rewardPointsAvailable?: number
  /** Se alcanzó el máximo de premios por pedido. */
  rewardLimitReached?: boolean
  /** storeItemIds de los premios ya agregados al carrito (se muestran como "✓ En el pedido"). */
  cartRewardIds?: string[]
  onAddReward?: (item: StoreItem) => void
  /** Muestra el input de celular inline (club habilitado y todavía sin miembro identificado). */
  identifyEnabled?: boolean
  /** Lookup exitoso: el padre setea la membresía y precarga el checkout. */
  onMemberIdentified?: (member: IdentifiedMember) => void
}

const COUNTRY_CODES = ['+54', '+598', '+56', '+55', '+51', '+52', '+1', '+34', '+44', '+49', '+33', '+39']

type LookupState = 'idle' | 'checking' | 'not_found' | 'error'

export default function StoreCarousel({ tenantSlug, memberPoints, locationId, rewardEnabled, rewardPointsAvailable, rewardLimitReached, cartRewardIds, onAddReward, identifyEnabled, onMemberIdentified }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [phoneDigits, setPhoneDigits] = useState('')
  const [countryCode, setCountryCode] = useState('+54')
  const [lookupState, setLookupState] = useState<LookupState>('idle')
  const identifyCbRef = useRef(onMemberIdentified)
  identifyCbRef.current = onMemberIdentified

  useEffect(() => {
    fetchItems()
  }, [tenantSlug])

  // Lookup por celular con debounce (mismo patrón y timing que CheckoutContext):
  // identifica al miembro sin navegar y sin exponer el input en el checkout.
  useEffect(() => {
    if (!identifyEnabled) return
    const digits = phoneDigits.replace(/\D/g, '')
    if (digits.length < 8) {
      setLookupState('idle')
      return
    }
    setLookupState('checking')
    const timer = setTimeout(async () => {
      try {
        const fullPhone = `${countryCode}${digits}`
        const res = await fetch(`/api/${tenantSlug}/loyalty/lookup?phone=${encodeURIComponent(fullPhone)}`)
        const data = await res.json()
        if (res.ok && data.member) {
          import('@/lib/events').then(({ captureLoyaltyLookup }) => {
            captureLoyaltyLookup({
              phoneHash: data.member.phoneHash || '',
              found: true,
              segment: data.member.segment,
              points: data.member.points,
            })
          })
          identifyCbRef.current?.({
            name: data.member.name || '',
            points: data.member.points || 0,
            joinedAt: data.member.joinedAt,
            countryCode,
            phoneDigits: digits,
          })
        } else if (res.status === 404) {
          setLookupState('not_found')
        } else {
          setLookupState('error')
        }
      } catch {
        setLookupState('error')
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [phoneDigits, countryCode, identifyEnabled, tenantSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading && items.length > 0) {
      trackRewardViewed({ type: 'store_item', currentPoints: memberPoints, pointsRequired: items[0]?.pointsCost, locationId, tenantSlug })
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchItems() {
    try {
      const res = await fetch(`/api/${tenantSlug}/store/items?isActive=true`)
      const data = await res.json()
      if (res.ok) {
        setItems(data.items || [])
      }
    } catch {
      // Silently fail - store is optional
    } finally {
      setLoading(false)
    }
  }

  if (loading || items.length === 0) return null

  const storeUrl = `/app/profile/club/${tenantSlug}?tab=store&origin=menu${locationId ? `&locationId=${locationId}` : ''}`

  return (
    <div className="px-4 py-6 bg-gradient-to-b from-purple-50/50 to-transparent">
      {/* Header — no points badge here, that lives in PointsStickyBar */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">Canjeá tus puntos</h2>
        <button 
          onClick={() => router.push(storeUrl)}
          className="flex items-center gap-1 text-sm font-medium text-orange-500 hover:text-orange-600 transition-colors"
        >
          Ver más
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Identificación inline: celular en el carrusel, sin navegar */}
      {identifyEnabled && (
        <div className="mb-4 p-3 rounded-2xl bg-white border border-purple-100 shadow-sm">
          <p className="text-sm font-bold text-gray-900">Identificate para canjear puntos</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Ingresá tu celular y encontrá tus puntos al instante.
          </p>
          <div className="mt-2.5 flex gap-2">
            <select
              value={countryCode}
              onChange={e => setCountryCode(e.target.value)}
              aria-label="Código de país"
              className="w-[92px] border border-gray-200 rounded-xl px-2 py-2.5 text-xs text-center focus:outline-none focus:border-purple-400 bg-gray-50"
            >
              {COUNTRY_CODES.map(cc => (
                <option key={cc} value={cc}>{cc}</option>
              ))}
            </select>
            <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus-within:border-purple-400 min-w-0">
              <Phone size={14} className="text-gray-400 shrink-0" />
              <input
                type="tel"
                inputMode="numeric"
                value={phoneDigits}
                onChange={e => setPhoneDigits(e.target.value.replace(/\D/g, ''))}
                placeholder="11 6001 9734"
                maxLength={15}
                className="bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none w-full min-w-0"
              />
              {lookupState === 'checking' && (
                <Loader2 size={14} className="text-purple-500 animate-spin shrink-0" />
              )}
            </div>
          </div>
          {lookupState === 'not_found' && (
            <p className="text-xs font-medium text-red-500 mt-2 leading-snug">
              No encontramos un miembro activo con ese número. Si todavía no sos miembro,
              unite al club desde tu perfil.
            </p>
          )}
          {lookupState === 'error' && (
            <p className="text-xs font-medium text-amber-600 mt-2">
              No pudimos verificar el número. Intentá de nuevo en unos segundos.
            </p>
          )}
        </div>
      )}

      {/* Horizontal Carousel */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide snap-x snap-mandatory">
        {items.map((item) => {
          const inCart = (cartRewardIds ?? []).includes(item._id)
          const available = rewardPointsAvailable ?? 0
          const lacksPoints = available < item.pointsCost
          const canAdd = Boolean(onAddReward) && !rewardLimitReached && !lacksPoints
          return (
            <div key={item._id} className="flex-shrink-0 w-28 snap-start text-left group">
              <button
                onClick={() => router.push(storeUrl)}
                className="block w-full text-left"
              >
                {/* Product Image */}
                <div className="relative w-28 h-28 rounded-2xl overflow-hidden bg-gray-100 mb-2 shadow-sm group-hover:shadow-md transition-shadow">
                  {item.imageUrl ? (
                    <Image
                      src={cloudinaryUrl(item.imageUrl, { w: 300 })}
                      alt={item.name}
                      fill
                      sizes="112px"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      placeholder="blur"
                      blurDataURL={cloudinaryBlurUrl(item.imageUrl)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
                      <span className="text-2xl">🎁</span>
                    </div>
                  )}

                  {/* Points Badge on Image */}
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full text-xs font-bold text-orange-600 z-10">
                    {item.pointsCost.toLocaleString()} pts
                  </div>
                </div>

                {/* Product Name */}
                <p className="text-xs font-medium text-gray-700 line-clamp-2 leading-tight">
                  {item.name}
                </p>
              </button>

              {/* Add to cart (only when the tenant enabled checkout redemption) */}
              {rewardEnabled && (inCart ? (
                <div
                  aria-label={`${item.name} en el carrito`}
                  className="mt-1.5 w-full rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold py-1.5 text-center"
                >
                  ✓ En el pedido
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => canAdd && onAddReward?.(item)}
                  disabled={!canAdd}
                  aria-label={`Agregar ${item.name} al carrito`}
                  className={
                    canAdd
                      ? 'mt-1.5 w-full rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold py-1.5 transition-colors active:scale-[0.98]'
                      : 'mt-1.5 w-full rounded-xl bg-gray-100 text-gray-400 text-[11px] font-bold py-1.5 cursor-not-allowed'
                  }
                >
                  {rewardLimitReached
                    ? 'Máximo alcanzado'
                    : lacksPoints
                      ? `Faltan ${item.pointsCost - available} pts`
                      : `Agregar · ${item.pointsCost} pts`}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

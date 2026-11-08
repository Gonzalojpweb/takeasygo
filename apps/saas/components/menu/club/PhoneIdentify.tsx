'use client'

import { useEffect, useRef, useState, forwardRef } from 'react'
import { BorderBeam } from '@/components/ui/border-beam'

/** Miembro identificado inline desde la Tarjeta del Club (lookup por celular). */
export interface IdentifiedMember {
  name: string
  points: number
  joinedAt?: string
  countryCode: string
  phoneDigits: string
}

const COUNTRY_CODES = ['+54', '+598', '+56', '+55', '+51', '+52', '+1', '+34', '+44', '+49', '+33', '+39']

type LookupState = 'idle' | 'checking' | 'found' | 'not_found' | 'rate_limited' | 'error'

interface Props {
  tenantSlug: string
  onIdentified: (member: IdentifiedMember) => void
}

/**
 * Celular en una sola píldora (código + número). Lookup con debounce de 1 s,
 * igual que el CheckoutContext: identifica al miembro sin navegar.
 */
export const PhoneIdentify = forwardRef<HTMLInputElement, Props>(function PhoneIdentify({ tenantSlug, onIdentified }, inputRef) {
  const [phoneDigits, setPhoneDigits] = useState('')
  const [countryCode, setCountryCode] = useState('+54')
  const [state, setState] = useState<LookupState>('idle')
  const cbRef = useRef(onIdentified)
  useEffect(() => { cbRef.current = onIdentified }, [onIdentified])

  useEffect(() => {
    const digits = phoneDigits.replace(/\D/g, '')
    if (digits.length < 8) {
      setState('idle')
      return
    }
    setState('checking')
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
          setState('found')
          // Pausa breve con el borde en verde antes de pasar al saldo.
          setTimeout(() => {
            cbRef.current({
              name: data.member.name || '',
              points: data.member.points || 0,
              joinedAt: data.member.joinedAt,
              countryCode,
              phoneDigits: digits,
            })
          }, 250)
        } else if (res.status === 404) {
          setState('not_found')
        } else if (res.status === 429) {
          setState('rate_limited')
        } else {
          setState('error')
        }
      } catch {
        setState('error')
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [phoneDigits, countryCode, tenantSlug])

  const message =
    state === 'checking' ? { text: 'Buscando tus puntos…', tone: 'muted' as const }
    : state === 'not_found' ? { text: 'No encontramos un miembro con ese número. Si todavía no sos parte, sumate al club desde tu perfil.', tone: 'error' as const }
    : state === 'rate_limited' ? { text: 'Demasiados intentos. Esperá un minuto y volvé a intentarlo.', tone: 'warn' as const }
    : state === 'error' ? { text: 'No pudimos verificar el número. Intentá de nuevo en unos segundos.', tone: 'warn' as const }
    : null

  return (
    <div>
      <div
        className="relative rounded-2xl p-[1.5px]"
        style={{ background: state === 'found' ? '#2F9E44' : 'var(--club-line)' }}
      >
        {state === 'checking' && <BorderBeam colorFrom="var(--club-brand)" colorTo="var(--club-glow)" borderWidth={1.5} />}
        <div className="flex items-center overflow-hidden rounded-[14.5px]" style={{ background: 'var(--club-card)' }}>
          <select
            value={countryCode}
            onChange={e => setCountryCode(e.target.value)}
            aria-label="Código de país"
            className="h-[50px] cursor-pointer border-0 pl-3 pr-2 text-sm font-bold outline-none"
            style={{ background: 'var(--club-chip)', color: 'var(--club-fg)' }}
          >
            {COUNTRY_CODES.map(cc => (
              <option key={cc} value={cc}>{cc}</option>
            ))}
          </select>
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phoneDigits}
            onChange={e => setPhoneDigits(e.target.value.replace(/\D/g, ''))}
            placeholder="11 6001 9734"
            maxLength={15}
            aria-label="Número de celular"
            className="h-[50px] min-w-0 flex-1 border-0 bg-transparent px-3 text-[17px] font-semibold tracking-wide tabular-nums outline-none placeholder:font-medium placeholder:opacity-40"
            style={{ color: 'var(--club-fg)' }}
          />
          <span className="grid w-10 shrink-0 place-items-center">
            {state === 'checking' && (
              <span
                aria-hidden="true"
                className="h-[18px] w-[18px] animate-spin rounded-full border-[2.5px]"
                style={{ borderColor: 'var(--club-soft)', borderTopColor: 'var(--club-brand)' }}
              />
            )}
          </span>
        </div>
      </div>
      <p
        aria-live="polite"
        className="mx-0.5 mt-2 min-h-[18px] text-[12.5px] leading-snug"
        style={{
          color: message?.tone === 'error' ? '#E03131' : message?.tone === 'warn' ? '#E67700' : 'var(--club-muted)',
          fontWeight: message && message.tone !== 'muted' ? 600 : 400,
        }}
      >
        {message?.text}
      </p>
    </div>
  )
})

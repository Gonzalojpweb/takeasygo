'use client'

import { useState, useRef } from 'react'

interface Props {
  orderId: string
  token: string
  tenant: string
  orderNumber: string
  onCompleted: () => void
}

export default function DeliveryCodeInput({
  orderId,
  token,
  orderNumber,
  onCompleted,
}: Props) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return

    const newDigits = [...digits]
    newDigits[index] = value.slice(-1)
    setDigits(newDigits)

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const code = digits.join('')

  async function handleSubmit() {
    if (code.length !== 6) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/delivery/${orderId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-delivery-token': token,
        },
        body: JSON.stringify({ code }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Código incorrecto')
      }

      onCompleted()
    } catch (err: any) {
      setError(err.message)
      setDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-emerald-200 p-6 shadow-sm">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">🔑</div>
        <h2 className="font-bold text-lg">Ingresá el código del cliente</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Pedíle al cliente que te lea el código de 6 dígitos de su pantalla
        </p>
      </div>

      <div className="grid grid-cols-6 gap-1.5 mb-6 w-full">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            className="w-full aspect-square text-center text-xl font-black rounded-xl border-2 border-zinc-200 focus:border-emerald-500 focus:outline-none transition-all bg-zinc-50"
            autoFocus={i === 0}
          />
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || code.length !== 6}
        className="w-full py-4 rounded-xl bg-emerald-500 text-white font-bold text-base hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-lg shadow-emerald-200"
      >
        {loading ? 'Verificando...' : '✅ Confirmar entrega'}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-500 text-center">{error}</p>
      )}

      <p className="mt-3 text-xs text-zinc-400 text-center">
        Pedido # {orderNumber}
      </p>
    </div>
  )
}

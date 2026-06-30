'use client'

import { useCheckout } from '@/contexts/CheckoutContext'
import { cn } from '@/lib/utils'

export default function CustomerInfoForm() {
  const { state, dispatch } = useCheckout()
  const { form, loyaltyConfig, joinClub } = state

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-sm text-zinc-500 uppercase tracking-wide">Tus datos</h2>

      <input
        required
        placeholder="Nombre *"
        value={form.name}
        onChange={e => dispatch({ type: 'SET_FORM', form: { name: e.target.value } })}
        className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
      />

      <div className="flex gap-2">
        <select
          value={form.countryCode}
          onChange={e => dispatch({ type: 'SET_FORM', form: { countryCode: e.target.value } })}
          className="w-[88px] border border-zinc-200 rounded-xl px-2 py-3 text-sm focus:outline-none focus:border-zinc-400 text-center"
        >
          <option value="+54">🇦🇷 +54</option>
          <option value="+598">🇺🇾 +598</option>
          <option value="+56">🇨🇱 +56</option>
          <option value="+55">🇧🇷 +55</option>
          <option value="+51">🇵🇪 +51</option>
          <option value="+52">🇲🇽 +52</option>
          <option value="+1">🇺🇸 +1</option>
          <option value="+34">🇪🇸 +34</option>
          <option value="+44">🇬🇧 +44</option>
          <option value="+49">🇩🇪 +49</option>
          <option value="+33">🇫🇷 +33</option>
          <option value="+39">🇮🇹 +39</option>
        </select>
        <input
          required={joinClub}
          placeholder={joinClub ? 'Teléfono (obligatorio) *' : 'Teléfono (opcional)'}
          type="tel"
          value={form.phone}
          onChange={e => dispatch({ type: 'SET_FORM', form: { phone: e.target.value.replace(/\D/g, '') } })}
          className={cn(
            'flex-1 border rounded-xl px-4 py-3 text-base focus:outline-none transition-all',
            joinClub && !form.phone.trim()
              ? 'border-amber-300 bg-amber-50/30 focus:border-amber-500'
              : 'border-zinc-200 focus:border-zinc-400',
          )}
        />
      </div>
      {form.countryCode === '+54' && (
        <p className="text-[10px] text-zinc-400 mt-1 ml-1 font-medium italic">
          Ej: 11 6001 9734 (Sin el 0 ni el 9)
        </p>
      )}

      <input
        required={joinClub}
        placeholder={joinClub ? 'Email (obligatorio para el club) *' : 'Email (opcional)'}
        type="email"
        value={form.email}
        onChange={e => dispatch({ type: 'SET_FORM', form: { email: e.target.value } })}
        className={cn(
          'w-full border rounded-xl px-4 py-3 text-base focus:outline-none transition-all',
          joinClub && !form.email.trim()
            ? 'border-amber-300 bg-amber-50/30 focus:border-amber-500'
            : 'border-zinc-200 focus:border-zinc-400',
        )}
      />

      <textarea
        placeholder="Notas o aclaraciones (opcional)"
        value={form.notes}
        onChange={e => dispatch({ type: 'SET_FORM', form: { notes: e.target.value } })}
        rows={3}
        className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400 resize-none"
      />
    </div>
  )
}

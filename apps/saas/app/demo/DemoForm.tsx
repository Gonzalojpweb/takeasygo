'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type SubmitState = 'idle' | 'loading' | 'success' | 'error'

interface DemoFormProps {
    canal?: string
}

export default function DemoForm({ canal }: DemoFormProps) {
    const [formData, setFormData] = useState({ name: '', business: '', email: '', phone: '', countryCode: '+54' })
    const [submitState, setSubmitState] = useState<SubmitState>('idle')
    const [errorMsg, setErrorMsg] = useState('')

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitState('loading')
        setErrorMsg('')

        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    business: formData.business,
                    email: formData.email,
                    phone: `${formData.countryCode} ${formData.phone}`,
                    plan: 'Demo – Solicitud de demostración',
                    planId: 'demo',
                    notes: canal ? `Canal: ${canal}` : '',
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                setErrorMsg(data.error || 'Error al enviar. Intentá de nuevo.')
                setSubmitState('error')
                return
            }

            setSubmitState('success')
        } catch {
            setErrorMsg('Error de conexión. Intentá de nuevo.')
            setSubmitState('error')
        }
    }

    if (submitState === 'success') {
        return (
            <div className="flex flex-col items-center gap-5 py-10 text-center">
                <CheckCircle2 size={56} strokeWidth={1.4} className="text-[#f14722]" />
                <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 tracking-tight">
                    ¡Demo solicitada!
                </h2>
                <p className="text-zinc-500 text-base max-w-sm leading-relaxed">
                    Te contactamos en breve para agendar tu demo personalizada.
                </p>
            </div>
        )
    }

    return (
        <form
            className="w-full flex flex-col gap-6"
            onSubmit={handleSubmit}
            noValidate
        >
            {/* Nombre */}
            <div className="flex flex-col gap-2 text-left">
                <label
                    htmlFor="demo-name"
                    className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest"
                >
                    Nombre
                </label>
                <input
                    id="demo-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Tu nombre"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    disabled={submitState === 'loading'}
                    className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm disabled:opacity-50"
                />
            </div>

            {/* Negocio */}
            <div className="flex flex-col gap-2 text-left">
                <label
                    htmlFor="demo-business"
                    className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest"
                >
                    Negocio
                </label>
                <input
                    id="demo-business"
                    name="business"
                    type="text"
                    autoComplete="organization"
                    placeholder="Nombre del restaurante"
                    required
                    value={formData.business}
                    onChange={handleChange}
                    disabled={submitState === 'loading'}
                    className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm disabled:opacity-50"
                />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-2 text-left">
                <label
                    htmlFor="demo-email"
                    className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest"
                >
                    Email
                </label>
                <input
                    id="demo-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@email.com"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    disabled={submitState === 'loading'}
                    className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm disabled:opacity-50"
                />
            </div>

            {/* Teléfono con Código de País */}
            <div className="flex flex-col gap-2 text-left">
                <label
                    htmlFor="demo-phone"
                    className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest"
                >
                    Teléfono
                </label>
                <div className="flex gap-2">
                    <select
                        name="countryCode"
                        value={formData.countryCode}
                        onChange={handleChange}
                        disabled={submitState === 'loading'}
                        className="bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 text-sm disabled:opacity-50 focus:outline-none focus:border-zinc-900 w-[85px]"
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
                        id="demo-phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="9 11 0000 0000"
                        required
                        value={formData.phone}
                        onChange={handleChange}
                        disabled={submitState === 'loading'}
                        className="flex-1 bg-transparent border-b-2 border-zinc-200 py-3 text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:border-zinc-900 transition-colors text-sm disabled:opacity-50"
                    />
                </div>
            </div>

            {submitState === 'error' && (
                <p className="text-xs text-red-500 font-medium text-center">
                    {errorMsg}
                </p>
            )}

            <Button
                type="submit"
                disabled={submitState === 'loading'}
                className="w-full bg-zinc-900 text-white rounded-full h-14 font-bold uppercase tracking-widest text-[11px] shadow-xl hover:bg-[#f14722] transition-all mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {submitState === 'loading' ? 'Enviando…' : 'Solicitar Demo Gratuita'}
            </Button>
        </form>
    )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckoutProvider, useCheckout } from '@/contexts/CheckoutContext'
import CheckoutStepper from './CheckoutStepper'
import OrderSummaryWithUpsell from './OrderSummaryWithUpsell'
import DeliveryModeToggle from './DeliveryModeToggle'
import DeliveryAddressForm from './DeliveryAddressForm'
import TakeawayScheduleSection from './TakeawayScheduleSection'
import CustomerInfoForm from './CustomerInfoForm'
import CheckoutPaymentFooter from './CheckoutPaymentFooter'
import CheckoutMiniHeader from './CheckoutMiniHeader'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Clock, AlertTriangle, Star, Gift, X } from 'lucide-react'
import { terminos, privacidad } from '@/lib/legal-content'
import { captureRewardRedeemed } from '@/lib/tia/events'

interface Props {
  tenantSlug: string
  locationId: string
  mode: 'takeaway' | 'delivery'
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
}

export default function CheckoutLayout(props: Props) {
  return (
    <CheckoutProvider {...props}>
      <CheckoutLayoutInner />
    </CheckoutProvider>
  )
}

function CheckoutLayoutInner() {
  const router = useRouter()
  const { state, dispatch, steps, effectiveTime, delayEnabled, extraMinutes, delayMessage, selectedRewardItem, subtotal, discountAmount, deliveryCost, baseTotal, total, activeSurchargePercent, missingPoints, canUseSos, effectiveAdvanceLimit, tenantName, transferData } = useCheckout()
  const { currentStep, activeOrderNumber, tenantSlug, deliveryMode, mode, loyaltyMember, loyaltyConfig, joinClub, walletEnabled, storeItems, selectedRewardItemId, rewardItemLoading, pointsLookupLoading, kriptonEnabled, transferEnabled, selectedPaymentMethod, scheduleOrder, activeQrPromo, estimatedTimeInfo, deliveryQuote } = state

  const [legalModal, setLegalModal] = useState<'terminos' | 'privacidad' | null>(null)
  const [storedName, setStoredName] = useState<string | null>(null)

  // Pre-fill name from localStorage identity on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`tgo-customer-${tenantSlug}`)
      if (!raw) return
      const data = JSON.parse(raw)
      if (data?.name) {
        setStoredName(data.name)
        if (!state.form.name) {
          dispatch({ type: 'SET_FORM', form: { name: data.name } })
        }
      }
    } catch {}
  }, [tenantSlug])

  if (activeOrderNumber) {
    return <ActiveOrderBlocker tenantSlug={tenantSlug} orderNumber={activeOrderNumber} onBack={() => dispatch({ type: 'SET_ACTIVE_ORDER', orderNumber: null })} />
  }

  const customerStepIndex = deliveryMode ? 2 : 1

  const stepContent = (step: number) => {
    if (step === 0) {
      return (
        <div className="space-y-6">
          {estimatedTimeInfo && !scheduleOrder && (
            <EstimatedTimeDisplay
              effectiveTime={effectiveTime}
              delayEnabled={delayEnabled}
              delayMessage={delayMessage}
              extraMinutes={extraMinutes}
              baseTime={estimatedTimeInfo.baseTime}
            />
          )}
          <OrderSummaryWithUpsell />
          {(mode === 'takeaway' || mode === 'delivery') && <DeliveryModeToggle />}
        </div>
      )
    }

    if (step === 1 && deliveryMode) {
      return <DeliveryAddressForm />
    }

    if ((step === 1 && !deliveryMode) || (step === 2 && deliveryMode)) {
      return (
        <div className="space-y-6">
          {!deliveryMode && <TakeawayScheduleSection />}

          {storedName && (
            <div className="text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              ¡Qué bueno verte de nuevo, {storedName}! 🙌
            </div>
          )}

          <CustomerInfoForm />

          <PromoCodeInput />
          {/* ^ Si se ingresa un código, se envía como body.promoCode al backend */}

          <LoyaltySection
            loyaltyMember={loyaltyMember}
            loyaltyConfig={loyaltyConfig}
            joinClub={joinClub}
            walletEnabled={walletEnabled}
            storeItems={storeItems}
            selectedRewardItemId={selectedRewardItemId}
            rewardItemLoading={rewardItemLoading}
            pointsLookupLoading={pointsLookupLoading}
            selectedRewardItem={selectedRewardItem}
            missingPoints={missingPoints}
            canUseSos={canUseSos}
            effectiveAdvanceLimit={effectiveAdvanceLimit}
            tenantSlug={tenantSlug}
            onJoinClubChange={(join) => dispatch({ type: 'SET_JOIN_CLUB', join })}
            onSelectReward={(id) => {
              dispatch({ type: 'SET_SELECTED_REWARD', id })
              if (id) captureRewardRedeemed({ _id: id, type: 'store_item', value: storeItems.find(i => i._id === id)?.pointsCost ?? 0 })
            }}
            onBirthDateChange={(birthDate) => dispatch({ type: 'SET_FORM', form: { birthDate } })}
            onWalletClick={() => router.push(`/${tenantSlug}/club/lookup`)}
          />

          <LegalLinks onOpen={(modal) => setLegalModal(modal)} />
        </div>
      )
    }

    if (step === steps.length - 1) {
      return (
        <PaymentConfirmation
          mode={mode}
          deliveryMode={deliveryMode}
          tenantName={tenantName}
          selectedPaymentMethod={selectedPaymentMethod}
          kriptonEnabled={kriptonEnabled}
          transferEnabled={transferEnabled}
          subtotal={subtotal}
          discountAmount={discountAmount}
          activeQrPromo={activeQrPromo}
          selectedRewardItem={selectedRewardItem}
          deliveryQuote={deliveryQuote}
          deliveryCost={deliveryCost}
          baseTotal={baseTotal}
          total={total}
          activeSurchargePercent={activeSurchargePercent}
          transferData={transferData}
          onPaymentMethodChange={(method) => dispatch({ type: 'SET_PAYMENT_METHOD', method })}
        />
      )
    }

    return null
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <CheckoutMiniHeader />
      <CheckoutStepper steps={steps} currentStep={currentStep} />

      <div className="flex-1 overflow-y-auto max-w-md mx-auto w-full px-4 pb-32 pt-2 [scrollbar-gutter:stable]">
        <div className="min-h-full">
          <AnimatePresence mode="wait" custom={currentStep}>
            <motion.div
              key={currentStep}
              custom={currentStep}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
            >
              {stepContent(currentStep)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <CheckoutPaymentFooter />

      <LegalModal modal={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  )
}

/* ── Sub-components ────────────────────────────────────── */

function EstimatedTimeDisplay({ effectiveTime, delayEnabled, delayMessage, extraMinutes, baseTime }: {
  effectiveTime: number; delayEnabled: boolean; delayMessage: string; extraMinutes: number; baseTime: number
}) {
  return (
    <div className={cn(
      'rounded-2xl p-4 border transition-all',
      delayEnabled ? 'bg-amber-50 border-amber-200' : 'bg-zinc-50 border-zinc-100'
    )}>
      <div className="flex items-center gap-2">
        <Clock size={16} className={delayEnabled ? 'text-amber-600' : 'text-zinc-500'} />
        <span className={cn('text-sm font-semibold', delayEnabled ? 'text-amber-900' : 'text-zinc-700')}>
          ⏱ Listo en ~{effectiveTime} min
        </span>
      </div>
      {delayEnabled && (
        <div className="mt-2 space-y-1">
          <div className="flex items-start gap-2 text-xs text-amber-700">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>El restaurante está experimentando demoras{delayMessage ? `: "${delayMessage}"` : ''}</span>
          </div>
          <p className="text-[11px] text-amber-600 pl-5">
            Tiempo estimado base: ~{baseTime} min{extraMinutes > 0 && <> · Demora informada: +{extraMinutes} min</>}
          </p>
        </div>
      )}
    </div>
  )
}

function LoyaltySection(props: {
  loyaltyMember: any; loyaltyConfig: any; joinClub: boolean; walletEnabled: boolean
  storeItems: any[]; selectedRewardItemId: string | null; rewardItemLoading: boolean; pointsLookupLoading: boolean
  selectedRewardItem: any; missingPoints: number; canUseSos: boolean; effectiveAdvanceLimit: number
  tenantSlug: string
  onJoinClubChange: (join: boolean) => void
  onSelectReward: (id: string | null) => void
  onBirthDateChange: (birthDate: string) => void
  onWalletClick: () => void
}) {
  const {
    loyaltyMember, loyaltyConfig, joinClub, walletEnabled,
    storeItems, selectedRewardItemId, rewardItemLoading, pointsLookupLoading,
    selectedRewardItem, missingPoints, canUseSos, effectiveAdvanceLimit, tenantSlug,
    onJoinClubChange, onSelectReward, onBirthDateChange, onWalletClick,
  } = props

  if (!loyaltyConfig?.enabled) return null

  return (
    <div className="space-y-3">
      {/* VIP member card */}
      {loyaltyMember && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="p-4 rounded-2xl border-2 border-zinc-900 bg-zinc-900 text-white shadow-xl shadow-zinc-200 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Star size={80} className="fill-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-amber-400 text-zinc-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
                VIP Member
              </div>
              <span className="text-xs font-medium text-zinc-400">¡Hola, {loyaltyMember.name}!</span>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-black tabular-nums">{loyaltyMember.points}</p>
                <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Tus puntos acumulados</p>
              </div>
              {loyaltyMember.hasAdvanceActive && (
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">Adelanto activo</span>
                  <span className="text-[11px] text-zinc-400">-{loyaltyMember.pointsPendingToConsolidate} pts por consolidar</span>
                </div>
              )}
            </div>
            {walletEnabled && (
              <button
                type="button"
                onClick={onWalletClick}
                className="mt-3 w-full h-10 rounded-xl text-xs font-bold transition-all active:scale-[0.985] flex items-center justify-center gap-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 100 4h4v-4h-4z"/></svg>
                Guardar en billetera digital
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Store items for redemption */}
      {loyaltyMember && storeItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Gift size={16} className="text-zinc-700" />
            <h3 className="text-sm font-bold text-zinc-700">Canjeá tus puntos</h3>
          </div>
          {rewardItemLoading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
              {storeItems.map(item => {
                const isSelected = selectedRewardItemId === item._id
                const enoughPoints = loyaltyMember.points >= item.pointsCost
                const needsAdvance = !enoughPoints
                const itemMissingPoints = item.pointsCost - (loyaltyMember?.points ?? 0)
                const canAdvance = needsAdvance && effectiveAdvanceLimit > 0 && itemMissingPoints <= effectiveAdvanceLimit && !loyaltyMember?.hasAdvanceActive

                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => {
                      if (isSelected) { onSelectReward(null) }
                      else if (enoughPoints || canAdvance) { onSelectReward(item._id) }
                    }}
                    disabled={!enoughPoints && !canAdvance}
                    className={cn(
                      'flex-shrink-0 w-50 snap-start rounded-2xl border-2 p-3 text-left transition-all duration-500',
                      isSelected ? 'border-zinc-900 bg-zinc-50' : !enoughPoints && !canAdvance ? 'border-zinc-100 bg-zinc-50 opacity-50 grayscale cursor-not-allowed' : 'border-zinc-200 bg-white hover:border-zinc-300',
                    )}
                  >
                    {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="w-full h-20 object-cover rounded-xl mb-2" />}
                    <p className="text-xs font-bold text-zinc-800 truncate">{item.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Star size={11} className="fill-amber-400 text-amber-400" />
                      <span className="text-xs font-semibold text-zinc-600">{item.pointsCost} pts</span>
                    </div>
                    {isSelected && enoughPoints && <span className="mt-1 block text-[10px] font-bold text-green-600">✓ Canjeado</span>}
                    {isSelected && !enoughPoints && <span className="mt-1 block text-[10px] font-bold text-amber-600">Con Reward Advance</span>}
                    {!isSelected && !enoughPoints && canAdvance && <span className="mt-1 block text-[10px] font-medium text-amber-500">Faltan {itemMissingPoints} pts</span>}
                    {!isSelected && !enoughPoints && !canAdvance && <span className="mt-1 block text-[10px] font-medium text-zinc-400">Te faltan {itemMissingPoints} pts</span>}
                  </button>
                )
              })}
            </div>
          )}
          {selectedRewardItem && !selectedRewardItem._id && canUseSos && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs font-bold text-amber-800">Te adelantamos {missingPoints} pts para que disfrutes tu recompensa hoy.</p>
              <p className="text-[11px] text-amber-600 mt-0.5">Disfrutá tu canje a 0$. Consolidá tu progreso en tu próxima compra.</p>
            </div>
          )}
        </div>
      )}

      {/* Join club */}
      {!loyaltyMember && (
        <label className="flex items-start gap-3 p-4 rounded-2xl border-2 border-amber-200 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors">
          <input
            type="checkbox"
            checked={joinClub}
            onChange={e => onJoinClubChange(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-amber-300 text-amber-500 focus:ring-amber-400"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Star size={16} className="text-amber-500 fill-amber-500" />
              <span className="text-sm font-bold text-amber-900">Unirme a {loyaltyConfig.clubName || 'Club de Fidelización'}</span>
            </div>
            <p className="text-xs text-amber-700 mt-1">{loyaltyConfig.welcomeMessage || 'Completá tu registro para recibir beneficios exclusivos.'}</p>
          </div>
        </label>
      )}

      {/* Birth date */}
      {joinClub && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700">
            Fecha de nacimiento <span className="text-zinc-400">(opcional)</span>
          </label>
          <input
            type="date"
            onChange={e => onBirthDateChange(e.target.value)}
            max={new Date(Date.now() - 13 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
            min={new Date(Date.now() - 120 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-zinc-400"
          />
          <p className="text-xs text-zinc-500">Te enviaremos felicitaciones en tu cumpleaños y ofertas especiales</p>
        </div>
      )}
    </div>
  )
}

function PaymentMethodSelector({ selected, onChange, transferEnabled }: { selected: string; onChange: (method: 'mercadopago' | 'kripton' | 'transfer') => void; transferEnabled?: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Método de pago</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange('mercadopago')}
          className={cn(
            'flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all',
            selected === 'mercadopago' ? 'border-zinc-900 bg-zinc-900/5' : 'border-zinc-200 bg-white',
          )}
        >
          <span className="text-2xl">💳</span>
          <div>
            <p className="text-sm font-bold text-zinc-900">Mercado Pago</p>
            <p className="text-[10px] text-zinc-500">Tarjeta, efectivo, transferencia</p>
          </div>
        </button>
        {transferEnabled && (
          <button
            type="button"
            onClick={() => onChange('transfer')}
            className={cn(
              'flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all',
              selected === 'transfer' ? 'border-emerald-600 bg-emerald-600/5' : 'border-zinc-200 bg-white',
            )}
          >
            <span className="text-2xl">🏦</span>
            <div>
              <p className="text-sm font-bold text-zinc-900">Transferencia</p>
              <p className="text-[10px] text-zinc-500">Precio de carta</p>
            </div>
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange('kripton')}
          className={cn(
            'flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all',
            selected === 'kripton' ? 'border-purple-600 bg-purple-600/5' : 'border-zinc-200 bg-white',
          )}
        >
          <span className="text-2xl">🪙</span>
          <div>
            <p className="text-sm font-bold text-zinc-900">Kripton</p>
            <p className="text-[10px] text-zinc-500">USDT, BTC, ETH y más</p>
          </div>
        </button>
      </div>
    </div>
  )
}

function PaymentConfirmation(props: {
  mode: 'takeaway' | 'delivery'
  deliveryMode: boolean
  tenantName: string
  selectedPaymentMethod: 'mercadopago' | 'kripton' | 'transfer'
  kriptonEnabled: boolean
  transferEnabled: boolean
  subtotal: number
  discountAmount: number
  activeQrPromo: any
  selectedRewardItem: any
  deliveryQuote: any
  deliveryCost: number
  baseTotal: number
  total: number
  activeSurchargePercent: number
  transferData: { alias: string | null; cbu: string | null; cvu: string | null; bankName: string | null; holderName: string | null } | null
  onPaymentMethodChange: (method: 'mercadopago' | 'kripton' | 'transfer') => void
}) {
  const {
    mode, deliveryMode, tenantName,
    selectedPaymentMethod, kriptonEnabled, transferEnabled,
    subtotal, discountAmount, activeQrPromo, selectedRewardItem,
    deliveryQuote, deliveryCost, baseTotal, total,
    activeSurchargePercent, transferData,
    onPaymentMethodChange,
  } = props

  const isDelivery = mode === 'delivery' || deliveryMode
  const restoName = tenantName || 'tu restaurante favorito'
  const [copiedField, setCopiedField] = useState<string | null>(null)

  return (
    <div className="space-y-5">

      {/* Payment method display */}
      <div className="rounded-2xl border-2 border-zinc-200 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Método de pago</p>
        {kriptonEnabled || transferEnabled ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onPaymentMethodChange('mercadopago')}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
                selectedPaymentMethod === 'mercadopago' ? 'border-zinc-900 bg-zinc-900/5' : 'border-zinc-200 bg-white',
              )}
            >
              <span className="text-2xl">💳</span>
              <div>
                <p className="text-sm font-bold text-zinc-900">Mercado Pago</p>
                <p className="text-[10px] text-zinc-500">Tarjeta, efectivo</p>
              </div>
            </button>
            {transferEnabled && (
              <button
                type="button"
                onClick={() => onPaymentMethodChange('transfer')}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
                  selectedPaymentMethod === 'transfer' ? 'border-emerald-600 bg-emerald-600/5' : 'border-zinc-200 bg-white',
                )}
              >
                <span className="text-2xl">🏦</span>
                <div>
                  <p className="text-sm font-bold text-zinc-900">Transferencia</p>
                  <p className="text-[10px] text-zinc-500">Precio de carta</p>
                </div>
              </button>
            )}
            <button
              type="button"
              onClick={() => onPaymentMethodChange('kripton')}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
                selectedPaymentMethod === 'kripton' ? 'border-purple-600 bg-purple-600/5' : 'border-zinc-200 bg-white',
              )}
            >
              <span className="text-2xl">🪙</span>
              <div>
                <p className="text-sm font-bold text-zinc-900">Kripton</p>
                <p className="text-[10px] text-zinc-500">USDT, BTC, ETH</p>
              </div>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50">
            <span className="text-2xl">💳</span>
            <div>
              <p className="text-sm font-bold text-zinc-900">Mercado Pago</p>
              <p className="text-[10px] text-zinc-500">Tarjeta, efectivo, transferencia</p>
            </div>
          </div>
        )}
      </div>

      {/* Surcharge info */}
      {selectedPaymentMethod !== 'transfer' && activeSurchargePercent > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <span className="text-lg">💡</span>
          <div className="text-xs text-amber-800">
            <p className="font-semibold">
              {selectedPaymentMethod === 'mercadopago' ? 'Mercado Pago' : 'Kripton'} · Precio con recargo
            </p>
            <p className="mt-0.5">
              ${baseTotal.toLocaleString('es-AR')} + {activeSurchargePercent}% ={' '}
              <strong>${total.toLocaleString('es-AR')}</strong>
            </p>
            <p className="mt-0.5 text-amber-600">
              Incluye costos operativos del medio de pago.
            </p>
          </div>
        </div>
      )}

      {/* Transfer bank data */}
      {selectedPaymentMethod === 'transfer' && transferData && (
        <div className="rounded-2xl bg-blue-50 border-2 border-blue-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏦</span>
            <p className="text-sm font-bold text-blue-900">Datos para transferir</p>
          </div>
          {transferData.alias && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Alias</p>
              <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-blue-100">
                <span className="text-sm font-mono font-bold text-zinc-900">{transferData.alias}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(transferData.alias!)
                    setCopiedField('alias')
                    setTimeout(() => setCopiedField(null), 2000)
                  }}
                  className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 hover:bg-blue-200 transition-colors"
                >
                  {copiedField === 'alias' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  )}
                </button>
              </div>
            </div>
          )}
          {(transferData.cbu || transferData.cvu) && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                {transferData.cbu && transferData.cvu ? 'CBU / CVU' : transferData.cbu ? 'CBU' : 'CVU'}
              </p>
              <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-blue-100">
                <span className="text-sm font-mono font-bold text-zinc-900">
                  {transferData.cbu || transferData.cvu}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(transferData.cbu || transferData.cvu!)
                    setCopiedField('cbu')
                    setTimeout(() => setCopiedField(null), 2000)
                  }}
                  className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 hover:bg-blue-200 transition-colors"
                >
                  {copiedField === 'cbu' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  )}
                </button>
              </div>
            </div>
          )}
          <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-200">
            <p className="text-[11px] text-amber-800 font-medium flex items-center gap-1">
              <span>⚠️</span>
              Transferí el monto exacto de <strong>${total.toLocaleString('es-AR')}</strong> y luego confirmá el pago en la pantalla de seguimiento.
            </p>
          </div>
        </div>
      )}

      {/* Price breakdown */}
      <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 space-y-2">
        <div className="flex justify-between text-sm text-zinc-500">
          <span>Subtotal</span>
          <span>${subtotal.toLocaleString('es-AR')}</span>
        </div>
        {activeQrPromo && (
          <div className="flex justify-between text-sm text-green-600 font-semibold">
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 5L5 19M6.5 9a2.5 2.5 0 110-5 2.5 2.5 0 010 5zM17.5 20a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>
              {activeQrPromo.checkoutDiscountLabel || 'Descuento QR'} ({activeQrPromo.discountPercentage}%)
            </span>
            <span>-${discountAmount.toLocaleString('es-AR')}</span>
          </div>
        )}
        {selectedRewardItem && (
          <div className="flex justify-between text-sm text-emerald-600 font-semibold">
            <span className="flex items-center gap-1">
              <Gift size={12} />
              {selectedRewardItem.name} (Canje)
            </span>
            <span>$0</span>
          </div>
        )}
        {isDelivery && deliveryQuote.withinRange && (
          <div className="flex justify-between text-sm text-zinc-500">
            <span className="flex items-center gap-1">🚚 Envío</span>
            <span>${deliveryQuote.cost.toLocaleString('es-AR')}</span>
          </div>
        )}
        {selectedPaymentMethod === 'transfer' ? (
          <div className="flex justify-between text-lg font-black text-emerald-700 pt-2 border-t border-zinc-200">
            <span>Total (precio de carta)</span>
            <span>${total.toLocaleString('es-AR')}</span>
          </div>
        ) : activeSurchargePercent > 0 ? (
          <>
            <div className="flex justify-between text-sm text-zinc-500 pt-2 border-t border-zinc-200">
              <span>Precio de carta</span>
              <span>${baseTotal.toLocaleString('es-AR')}</span>
            </div>
            <div className="flex justify-between text-sm text-amber-600 font-semibold">
              <span>Recargo ({activeSurchargePercent}%)</span>
              <span>+${(total - baseTotal).toLocaleString('es-AR')}</span>
            </div>
            <div className="flex justify-between text-lg font-black text-zinc-900">
              <span>Total</span>
              <span>${total.toLocaleString('es-AR')}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between text-lg font-black text-zinc-900 pt-2 border-t border-zinc-200">
            <span>Total</span>
            <span>${total.toLocaleString('es-AR')}</span>
          </div>
        )}
      </div>

      {/* Post-payment flow */}
      <div className="rounded-2xl border border-zinc-100 p-4 space-y-4 bg-white">
        {isDelivery ? (
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">🚚</span>
            <div>
              <p className="text-sm font-bold text-zinc-900">El pedido llega a tu puerta</p>
              <p className="text-xs text-zinc-500 mt-1">
                Te avisaremos cuando esté listo, cuando el delivery salga en camino y cuando llegue.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">🥡</span>
            <div>
              <p className="text-sm font-bold text-zinc-900">Cuando esté listo, te avisamos</p>
              <p className="text-xs text-zinc-500 mt-1">para que pases a retirarlo. ¡Sin esperas, sin filas!</p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <span className="text-lg mt-0.5">📱</span>
          <p className="text-xs text-zinc-600">
            Recordá que podés ver el estado de tu pedido desde la app en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-zinc-50 rounded-xl p-4">
          <span className="text-lg">🙌</span>
          <p className="text-sm font-bold text-zinc-800">¡Gracias por elegir {restoName}!</p>
        </div>
      </div>

      {/* TakeasyGO branding */}
      <div className="text-center pt-1 pb-2">
        <p className="text-[10px] text-zinc-300 uppercase tracking-widest font-medium">
          somos parte de la red
        </p>
        <div className="flex items-center justify-center gap-1.5 mt-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400"><path d="M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M3 9l2.45-4.9A2 2 0 017.24 3h9.52a2 2 0 011.8 1.1L21 9"/><path d="M12 3v6"/></svg>
          <span className="text-xs font-bold text-zinc-400 tracking-tight">TakeasyGO</span>
        </div>
      </div>
    </div>
  )
}

function LegalLinks({ onOpen }: { onOpen: (modal: 'terminos' | 'privacidad') => void }) {
  return (
    <div className="mt-4 text-center space-x-2">
      <button type="button" onClick={() => onOpen('terminos')} className="text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2 transition-colors">
        Términos y Condiciones
      </button>
      <span className="text-xs text-zinc-300">·</span>
      <button type="button" onClick={() => onOpen('privacidad')} className="text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2 transition-colors">
        Política de Privacidad
      </button>
    </div>
  )
}

function PromoCodeInput() {
  const { state, dispatch } = useCheckout()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  function handleApply() {
    const code = input.trim().toUpperCase()
    if (!code) return
    setError('')
    dispatch({ type: 'SET_PROMO_CODE', code })
    setInput('')
    setOpen(false)
  }

  return (
    <div className="border-t border-zinc-100 pt-4">
      {state.promoCode ? (
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 5L5 19M6.5 9a2.5 2.5 0 110-5 2.5 2.5 0 010 5zM17.5 20a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>
            <span className="text-sm font-bold text-indigo-700 font-mono">{state.promoCode}</span>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_PROMO_CODE', code: '' })}
            className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
          >
            Quitar
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs text-zinc-400 hover:text-zinc-600 font-medium flex items-center gap-1 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 5L5 19M6.5 9a2.5 2.5 0 110-5 2.5 2.5 0 010 5zM17.5 20a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>
            Tengo un código de descuento
          </button>
          {open && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => { setInput(e.target.value.toUpperCase()); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleApply()}
                placeholder="INVIERNO2024"
                className="flex-1 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-indigo-400 uppercase"
                autoFocus
              />
              <button
                type="button"
                onClick={handleApply}
                className="px-4 py-3 bg-zinc-900 text-white text-sm font-bold rounded-xl hover:bg-zinc-800 transition"
              >
                Aplicar
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      )}
    </div>
  )
}

function LegalModal({ modal, onClose }: { modal: 'terminos' | 'privacidad' | null; onClose: () => void }) {
  if (!modal) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 30 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        className="w-full max-w-md bg-white rounded-3xl max-h-[80dvh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b border-zinc-100 p-4 flex items-center justify-between rounded-t-3xl z-10">
          <h2 className="font-bold text-base text-zinc-900">
            {modal === 'terminos' ? 'Términos y Condiciones' : 'Política de Privacidad'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {(modal === 'terminos' ? terminos : privacidad).map((section: any, i: number) => (
            <div key={i}>
              <h3 className="font-bold text-sm text-zinc-900 mb-1">{section.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{section.body}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function ActiveOrderBlocker({ tenantSlug, orderNumber, onBack }: { tenantSlug: string; orderNumber: string; onBack: () => void }) {
  return (
    <div className="bg-white min-h-screen">
      <header className="sticky top-0 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-bold text-lg">Tu pedido</h1>
      </header>
      <div className="max-w-md mx-auto px-4 py-12 text-center space-y-5">
        <div className="text-5xl">🛍️</div>
        <h2 className="text-xl font-black">Tenés un pedido activo</h2>
        <p className="text-zinc-500 text-sm">Ya tenés un pedido en curso. Primero retirá ese pedido antes de hacer uno nuevo.</p>
        <a href={`/${tenantSlug}/tracking/${orderNumber}`} className="block w-full py-4 rounded-2xl bg-zinc-900 text-white font-bold text-base">
          Ver mi pedido #{orderNumber}
        </a>
      </div>
    </div>
  )
}

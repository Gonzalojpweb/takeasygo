'use client'

import { AlertTriangle } from 'lucide-react'

interface Props {
  onConfirm: () => void
  onCancel: () => void
}

export default function LocationConfirmDialog({ onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200/80 max-w-sm w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 shadow-sm">
            <AlertTriangle size={22} className="text-amber-600" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-base text-zinc-950 tracking-tight">¿Cambiar de sede?</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Tienes productos en tu carrito. Si cambias de sede ahora, tu pedido actual se perderá.
            </p>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all active:scale-[0.98] cursor-pointer focus:outline-none"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 px-4 rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 shadow-md shadow-red-600/15 transition-all active:scale-[0.98] cursor-pointer focus:outline-none"
          >
            Cambiar igual
          </button>
        </div>
      </div>
    </div>
  )
}

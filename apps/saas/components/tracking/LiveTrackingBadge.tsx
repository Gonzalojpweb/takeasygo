'use client'

export default function LiveTrackingBadge() {
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500 text-white text-xs font-bold shadow-lg shadow-green-500/30">
      <span className="relative flex w-2 h-2">
        <span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-75 animate-ping" />
        <span className="relative inline-flex w-2 h-2 rounded-full bg-white" />
      </span>
      Seguimiento en vivo
    </div>
  )
}

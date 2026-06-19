'use client'

interface Props {
  code: string
  primaryColor: string
  backgroundColor: string
  textColor: string
  orderMode?: string
}

export default function DeliveryCodeDisplay({
  code,
  primaryColor,
  backgroundColor,
  textColor,
  orderMode,
}: Props) {
  if (orderMode !== 'delivery') return null

  return (
    <div className="mb-8 rounded-2xl p-5 text-center"
      style={{ backgroundColor: primaryColor + '10', border: `2px solid ${primaryColor}40` }}>
      <div className="text-5xl mb-3">📱</div>
      <p className="font-bold text-lg mb-1">Tu pedido está listo</p>
      <p className="text-sm opacity-70 mb-4">
        Entregale este código de 6 dígitos al delivery cuando llegue
      </p>
      <div className="inline-block px-4 sm:px-8 py-4 rounded-2xl bg-white shadow-md w-full sm:w-auto"
        style={{ color: primaryColor }}>
        <p className="text-xs opacity-40 mb-1 uppercase tracking-widest font-bold">Código de entrega</p>
        <p className="text-2xl sm:text-4xl font-black tracking-[0.2em] sm:tracking-[0.3em] break-all">{code}</p>
      </div>
      <p className="text-xs opacity-40 mt-4">
        El delivery te pedirá este código para confirmar la entrega
      </p>
    </div>
  )
}

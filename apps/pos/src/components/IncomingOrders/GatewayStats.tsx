interface GatewayStatsProps {
  urgent: number
  pendingPayment: number
  paid: number
}

export function GatewayStats({ urgent, pendingPayment, paid }: GatewayStatsProps) {
  return (
    <div className="gateway-stats">
      <span className="gateway-stat">
        <span className="stat-dot urgent" /> {urgent} Urgentes
      </span>
      <span className="gateway-stat">
        <span className="stat-dot pending" /> {pendingPayment} Pago pendiente
      </span>
      <span className="gateway-stat">
        <span className="stat-dot paid" /> {paid} Pagados
      </span>
    </div>
  )
}

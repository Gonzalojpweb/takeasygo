interface GatewayStatsProps {
  urgent: number
  pendingPayment: number
  paid: number
  urgentDisabled?: boolean
}

export function GatewayStats({ urgent, pendingPayment, paid, urgentDisabled }: GatewayStatsProps) {
  return (
    <div className="gateway-stats">
      <span className={`gateway-stat${urgentDisabled ? " feature-disabled" : ""}`}>
        <span className="stat-dot urgent" /> {urgent} Urgentes
        {urgentDisabled && <span className="feature-disabled-tooltip">Próximamente</span>}
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

import type { DeliveryPerson } from "../../services/delivery"

interface DeliveryPersonCardProps {
  person: DeliveryPerson
  onAssign: (person: DeliveryPerson) => void
}

export function DeliveryPersonCard({ person, onAssign }: DeliveryPersonCardProps) {
  const statusLabel = person.isAvailable
    ? "● Disponible"
    : `○ ${person.currentOrderId ? "En delivery" : "No disponible"}`

  return (
    <div className="delivery-card">
      <div className="delivery-avatar">
        {person.name.charAt(0).toUpperCase()}
      </div>
      <div className="delivery-info">
        <div className="delivery-name">{person.name}</div>
        <div className="delivery-meta">
          {statusLabel}
          {person.phone && person.isAvailable && ` — ${person.phone}`}
          {person.vehicle && ` — ${person.vehicle}`}
        </div>
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => onAssign(person)}
        disabled={!person.isAvailable}
      >
        Asignar
      </button>
    </div>
  )
}

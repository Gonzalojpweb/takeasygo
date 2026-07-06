import { useState } from "react"
import { useAuth } from "../../hooks/useAuth"
import { updateCustomer } from "../../services/customers-api"
import type { CustomerSearchResult } from "../../services/customers-api"

interface EditCustomerFormProps {
  customer: CustomerSearchResult
  onUpdated: (customerId: string, updates: { name: string; phone?: string; email?: string }) => void
  onClose: () => void
}

export function EditCustomerForm({ customer, onUpdated, onClose }: EditCustomerFormProps) {
  const { state } = useAuth()
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined

  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone ?? "")
  const [email, setEmail] = useState(customer.email ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jwt) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("El nombre es obligatorio")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const input: { name?: string; phone?: string; email?: string } = {}
      if (trimmedName !== customer.name) input.name = trimmedName
      if (phone.trim() !== (customer.phone ?? "")) input.phone = phone.trim() || undefined
      if (email.trim() !== (customer.email ?? "")) input.email = email.trim() || undefined

      if (Object.keys(input).length === 0) {
        onClose()
        return
      }

      await updateCustomer(customer.customerId, input, jwt)
      onUpdated(customer.customerId, { name: trimmedName, phone: phone.trim() || undefined, email: email.trim() || undefined })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al actualizar cliente"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="customer-modal-overlay" onClick={onClose}>
      <div className="customer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="customer-modal-header">
          <div className="customer-modal-title">Editar cliente</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <form className="customer-form" onSubmit={handleSubmit}>
          <div className="customer-form-field">
            <label className="customer-form-label">Nombre *</label>
            <input
              className="customer-form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
            />
          </div>

          <div className="customer-form-field">
            <label className="customer-form-label">Teléfono</label>
            <input
              className="customer-form-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="customer-form-field">
            <label className="customer-form-label">Email</label>
            <input
              className="customer-form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
            />
          </div>

          {error && (
            <div className="customer-alert">
              <div className="customer-alert-title">Error</div>
              <div className="customer-alert-text">{error}</div>
            </div>
          )}

          <div className="customer-form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

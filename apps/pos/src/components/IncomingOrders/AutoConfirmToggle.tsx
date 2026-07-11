export function AutoConfirmToggle() {
  return (
    <div className="auto-confirm-toggle feature-disabled">
      <span>Auto-confirmar pagados</span>
      <div className="toggle-switch active" />
      <span className="feature-disabled-tooltip">Disponible cuando se integren marketplaces</span>
    </div>
  )
}
